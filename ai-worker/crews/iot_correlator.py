"""
IoT Correlation Engine
======================

Listens on the PostgreSQL 'iot_event' NOTIFY channel via asyncpg and
correlates raw IoT events into structured Work Orders according to the
company-specific rules stored in erp_iot_rules.

Architecture
------------
  ┌──────────────────────────────────────────────────────────────┐
  │                    IotCorrelator                             │
  │                                                              │
  │  asyncpg LISTEN 'iot_event'                                  │
  │       │                                                      │
  │       ▼                                                      │
  │  _on_notification()                                          │
  │       │  parse pg_notify envelope                            │
  │       │  push JSON blob into Redis ZADD                      │
  │       │  key = iot:zone:{company_id}:{zone_id}              │
  │       │  score = epoch time                                  │
  │       │                                                      │
  │       ▼                                                      │
  │  _schedule_flush(zone_key)                                   │
  │       │  asyncio.Task created per zone_key (idempotent)      │
  │       │  waits DEFAULT_WINDOW_SECONDS, then calls            │
  │       │                                                      │
  │       ▼                                                      │
  │  _flush_window(zone_key)                                     │
  │       │  ZRANGEBYSCORE to read all events in window          │
  │       │  load zone_type from DB                              │
  │       │  classify zone risk: STERILE | PUBLIC | UNKNOWN      │
  │       │  RuleEvaluator.evaluate()  →  CorrelationResult      │
  │       │                                                      │
  │       ▼                                                      │
  │  ActionDispatcher.execute()                                  │
  │       │  INSERT erp_work_orders  (if CREATE_WORK_ORDER)      │
  │       │  UPDATE erp_iot_events processed = true              │
  │       │  call ERP server action for hardware lock            │
  │       │  (ERP inserts into erp_hardware_action_log)          │
  └──────────────────────────────────────────────────────────────┘

Zone Risk Classification (user directive, verbatim):
  STERILE zones (utility_room, parking, roof, elevator_shaft, stairwell):
    "ANY detection of two people on a single credential triggers a P1
    work_order and calls the auto-lock action. Zero tolerance."

  PUBLIC zones (lobby, corridor, gym, pool_area, other):
    "ONLY trigger a P1 work_order IF the hardware explicitly flags the
    event as an anomaly (e.g. payload.anomaly_type == 'tailgate') OR if
    there is a 'door_held_open' event exceeding 45 seconds. If it's just
    a standard group entry (Escorting), the engine should simply UPDATE
    processed = true in erp_iot_events (silent INFO log for occupancy
    stats) and NOT generate a Work Order."

Lock action: must call the ERP Server Action API endpoint (not direct
hardware) so every outbound command is audited in erp_hardware_action_log.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import asyncpg
import httpx
import redis.asyncio as aioredis

from config import settings
from crews.adapters import get_adapter

log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_WINDOW_SECONDS: int = 10

DOOR_HELD_OPEN_THRESHOLD_SECONDS: int = 45

STERILE_ZONE_TYPES: frozenset[str] = frozenset({
    'utility_room',
    'parking',
    'roof',
    'elevator_shaft',
    'stairwell',
})

PUBLIC_ZONE_TYPES: frozenset[str] = frozenset({
    'lobby',
    'corridor',
    'gym',
    'pool_area',
    'other',
})

REDIS_KEY_PREFIX = 'iot:zone'

# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────


class ZoneRiskLevel(str, Enum):
    STERILE = 'sterile'   # Zero tolerance — any tailgate/two-person → P1 + lock
    PUBLIC = 'public'     # Only alert on explicit anomaly or door_held > 45s
    UNKNOWN = 'unknown'   # Zone type not classified; treat as PUBLIC


@dataclass(frozen=True)
class IotEventEnvelope:
    """Deserialised pg_notify payload from erp_iot_event_notify() trigger."""
    event_id: str
    company_id: str
    asset_id: str | None
    event_type: str
    provider: str
    received_at: str


@dataclass
class CorrelationResult:
    action: str          # 'CREATE_WORK_ORDER' | 'SILENT_LOG' | 'NO_ACTION'
    reason: str
    wo_priority: str = 'P3'
    wo_category: str = 'security_access'
    wo_title: str = ''
    wo_description: str = ''
    matched_rule_id: str | None = None
    should_lock_asset: bool = False
    event_ids: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Rule evaluator
# ─────────────────────────────────────────────────────────────────────────────


class RuleEvaluator:
    """
    Evaluates a batch of correlated IoT events against:
      1. Zone risk hardcoded logic (sterile / public directives)
      2. Company-specific erp_iot_rules from the DB

    Priority: zone risk logic wins over DB rules if they conflict.
    """

    async def evaluate(
        self,
        events: list[dict[str, Any]],
        zone_risk: ZoneRiskLevel,
        db_rules: list[dict[str, Any]],
    ) -> CorrelationResult:
        # Collect all event types and raw payloads for inspection
        event_types = {e.get('event_type', '') for e in events}
        event_ids = [e['id'] for e in events if 'id' in e]

        # ── STERILE ZONE LOGIC ───────────────────────────────────────────────
        if zone_risk == ZoneRiskLevel.STERILE:
            # Trigger: any event indicating >= 2 people on one credential
            if self._has_multi_person_event(events):
                log.warning(
                    '[RuleEvaluator] STERILE zone — two-person credential detected. '
                    'Triggering P1 WO + auto-lock. event_ids=%s', event_ids
                )
                return CorrelationResult(
                    action='CREATE_WORK_ORDER',
                    reason='Sterile zone: two people detected on a single credential.',
                    wo_priority='P1',
                    wo_category='security_access',
                    wo_title='[SECURITY] Two-person tailgate in restricted zone',
                    wo_description=(
                        'IoT sensor detected multiple individuals crossing on one credential '
                        'in a zero-tolerance zone. Immediate inspection required.'
                    ),
                    should_lock_asset=True,
                    event_ids=event_ids,
                )

        # ── PUBLIC ZONE LOGIC ────────────────────────────────────────────────
        if zone_risk in (ZoneRiskLevel.PUBLIC, ZoneRiskLevel.UNKNOWN):
            # Only escalate on explicit hardware anomaly flag or prolonged hold
            if self._has_explicit_tailgate_anomaly(events):
                return CorrelationResult(
                    action='CREATE_WORK_ORDER',
                    reason='Public zone: hardware explicitly flagged tailgate anomaly.',
                    wo_priority='P1',
                    wo_category='security_access',
                    wo_title='[SECURITY] Tailgate anomaly detected at entry',
                    wo_description=(
                        'Hardware camera/sensor flagged this event as a confirmed tailgate '
                        '(anomaly_type=tailgate). Physical inspection required.'
                    ),
                    should_lock_asset=False,
                    event_ids=event_ids,
                )

            if self._has_door_held_too_long(events):
                return CorrelationResult(
                    action='CREATE_WORK_ORDER',
                    reason=(
                        f'Public zone: door held open > {DOOR_HELD_OPEN_THRESHOLD_SECONDS}s.'
                    ),
                    wo_priority='P2',
                    wo_category='security_access',
                    wo_title='[SECURITY] Door held open for extended period',
                    wo_description=(
                        f'Door held open for more than {DOOR_HELD_OPEN_THRESHOLD_SECONDS} '
                        'seconds. May indicate propped door or mechanical fault.'
                    ),
                    should_lock_asset=False,
                    event_ids=event_ids,
                )

            if 'door_open' in event_types or 'tailgate_detected' in event_types:
                # Standard group entry in public area — silent occupancy stat
                log.info(
                    '[RuleEvaluator] Public zone standard entry — occupancy stat only. '
                    'event_ids=%s', event_ids
                )
                return CorrelationResult(
                    action='SILENT_LOG',
                    reason='Public zone: standard group entry, no anomaly flagged.',
                    event_ids=event_ids,
                )

        # ── DB RULE EVALUATION ───────────────────────────────────────────────
        # Fall through to company-specific rules if zone logic didn't match
        matched_rule = self._match_db_rule(event_types, db_rules)
        if matched_rule:
            wo_params = matched_rule.get('wo_params') or {}
            return CorrelationResult(
                action=matched_rule.get('action_type', 'SEND_ALERT'),
                reason=f'Matched DB rule: {matched_rule.get("rule_name", "unknown")}',
                wo_priority=wo_params.get('priority', 'P3'),
                wo_category=wo_params.get('category', 'general'),
                wo_title=wo_params.get('title_template', 'IoT-triggered work order'),
                wo_description=wo_params.get('description_template', ''),
                matched_rule_id=matched_rule.get('id'),
                event_ids=event_ids,
            )

        # Nothing matched
        return CorrelationResult(
            action='NO_ACTION',
            reason='No rule matched for event batch.',
            event_ids=event_ids,
        )

    # ── Private helpers ──────────────────────────────────────────────────────

    def _has_multi_person_event(self, events: list[dict[str, Any]]) -> bool:
        """True if any event indicates >= 2 people on one pass or a confirmed breach."""
        for event in events:
            normalized = event.get('normalized')
            if normalized is not None:
                # Prefer vendor-normalised data: 2+ people OR hardware-confirmed breach
                if normalized['person_count'] >= 2 or normalized['is_security_breach']:
                    return True
                continue  # Normalised data available — skip raw fallback for this event

            # Fallback: raw_payload inspection for events not yet normalised
            raw: dict = event.get('raw_payload') or {}
            person_count = raw.get('person_count', 0)
            if isinstance(person_count, (int, float)) and person_count >= 2:
                return True
            if event.get('event_type') in ('tailgate_detected', 'LPE_TAILGATE'):
                return True
            if raw.get('anomaly_type') == 'tailgate':
                return True
        return False

    def _has_explicit_tailgate_anomaly(self, events: list[dict[str, Any]]) -> bool:
        """True if hardware explicitly flagged a tailgate or forced-entry breach."""
        for event in events:
            normalized = event.get('normalized')
            if normalized is not None:
                if normalized['is_security_breach'] or normalized['specific_type'] in (
                    'tailgate', 'door_forced', 'alarm',
                ):
                    return True
                continue

            # Fallback: raw_payload inspection
            raw: dict = event.get('raw_payload') or {}
            if raw.get('anomaly_type') == 'tailgate':
                return True
            if event.get('event_type') == 'tailgate_detected':
                return True
        return False

    def _has_door_held_too_long(self, events: list[dict[str, Any]]) -> bool:
        """True if any event indicates a door held beyond the 45-second threshold."""
        for event in events:
            normalized = event.get('normalized')
            if normalized is not None:
                if (
                    normalized['specific_type'] == 'door_held'
                    and normalized['door_held_seconds'] > DOOR_HELD_OPEN_THRESHOLD_SECONDS
                ):
                    return True
                continue

            # Fallback: raw_payload inspection
            if event.get('event_type') not in (
                'door_held_open', 'DOOR_HELD_OPEN', 'DOOR_LEFT_OPEN', 'door.held_open',
            ):
                continue
            raw: dict = event.get('raw_payload') or {}
            seconds = raw.get('door_held_seconds') or raw.get('door_open_seconds', 0)
            if isinstance(seconds, (int, float)) and seconds > DOOR_HELD_OPEN_THRESHOLD_SECONDS:
                return True
        return False

    def _match_db_rule(
        self,
        event_types: set[str],
        db_rules: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        """Return the highest-priority rule whose required_event_types are all present."""
        candidates = [
            r for r in db_rules
            if r.get('is_active')
            and all(et in event_types for et in (r.get('required_event_types') or []))
        ]
        if not candidates:
            return None
        # Lower rule_priority number = higher importance (same as ticket priority)
        return min(candidates, key=lambda r: r.get('rule_priority', 999))


# ─────────────────────────────────────────────────────────────────────────────
# Action dispatcher
# ─────────────────────────────────────────────────────────────────────────────


class ActionDispatcher:
    """
    Executes the action chosen by RuleEvaluator:
      - INSERT erp_work_orders via Supabase REST (service role)
      - UPDATE erp_iot_events.processed = true
      - POST to ERP Server Action API for hardware lock (maintains audit trail)
    """

    def __init__(self, db_pool: asyncpg.Pool, http: httpx.AsyncClient) -> None:
        self._db = db_pool
        self._http = http

    async def execute(
        self,
        result: CorrelationResult,
        envelope: IotEventEnvelope,
        building_id: str | None,
        asset_id: str | None,
    ) -> None:
        if result.action == 'NO_ACTION':
            return

        correlation_id = str(uuid.uuid4())

        if result.action == 'SILENT_LOG':
            await self._mark_processed(result.event_ids, correlation_id, None, result.matched_rule_id)
            log.info(
                '[Dispatcher] Silent log. correlation_id=%s reason=%s',
                correlation_id, result.reason
            )
            return

        if result.action in ('CREATE_WORK_ORDER', 'COMPOSITE'):
            wo_id = await self._create_work_order(result, envelope, building_id, asset_id)
            await self._mark_processed(result.event_ids, correlation_id, wo_id, result.matched_rule_id)
            if result.should_lock_asset and asset_id:
                await self._request_hardware_lock(asset_id, envelope.company_id, wo_id)
            log.info(
                '[Dispatcher] Work order created. wo_id=%s correlation_id=%s',
                wo_id, correlation_id
            )

    # ── Private helpers ──────────────────────────────────────────────────────

    async def _create_work_order(
        self,
        result: CorrelationResult,
        envelope: IotEventEnvelope,
        building_id: str | None,
        asset_id: str | None,
    ) -> str:
        """INSERT a new work order and return its UUID."""
        # The system user is the AI Worker itself — use a reserved sentinel string
        # that the ERP recognises as a system-generated record.
        system_user_id = os.environ.get('AI_WORKER_SYSTEM_USER_ID', '')

        row = {
            'company_id': envelope.company_id,
            'title': result.wo_title,
            'description': result.wo_description,
            'category': result.wo_category,
            'priority': result.wo_priority,
            'status': 'open',
            'trigger_source': 'iot_sensor',
            'source_iot_event_id': envelope.event_id,
            'building_id': building_id,
            'asset_id': asset_id,
            'created_by': system_user_id,
        }

        # Remove None values — Postgres will use column defaults
        row = {k: v for k, v in row.items() if v is not None}

        work_order_id = await self._db.fetchval(
            """
            INSERT INTO public.erp_work_orders (
                company_id, title, description, category, priority, status,
                trigger_source, source_iot_event_id, building_id, asset_id,
                created_by
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8::uuid, $9::uuid, $10::uuid, $11::uuid
            )
            RETURNING id::text
            """,
            row.get('company_id'),
            row.get('title', ''),
            row.get('description', ''),
            row.get('category', 'general'),
            row.get('priority', 'P3'),
            'open',
            'iot_sensor',
            row.get('source_iot_event_id'),
            row.get('building_id'),
            row.get('asset_id'),
            row.get('created_by') or None,
        )

        return str(work_order_id)

    async def _mark_processed(
        self,
        event_ids: list[str],
        correlation_id: str,
        work_order_id: str | None,
        matched_rule_id: str | None,
    ) -> None:
        if not event_ids:
            return
        await self._db.execute(
            """
            UPDATE public.erp_iot_events
            SET
                processed     = true,
                processed_at  = now(),
                correlation_id   = $1::uuid,
                work_order_id    = $2::uuid,
                matched_rule_id  = $3::uuid
            WHERE id = ANY($4::uuid[])
            """,
            correlation_id,
            work_order_id,
            matched_rule_id,
            event_ids,
        )

    async def _request_hardware_lock(
        self,
        asset_id: str,
        company_id: str,
        work_order_id: str | None,
    ) -> None:
        """
        Request a door lock via the ERP Server Action API.
        The ERP endpoint handles the direct hardware call AND inserts into
        erp_hardware_action_log — this keeps the audit trail inside the ERP.
        """
        url = f'{settings.erp_base_url}/api/iot/hardware-action'
        payload = {
            'action_type': 'LOCK_DOOR',
            'asset_id': asset_id,
            'company_id': company_id,
            'work_order_id': work_order_id,
            'requested_by': 'iot_correlator',
        }
        # Sign with HMAC so the ERP endpoint can verify the worker's identity
        from hmac_utils import sign_payload
        body_bytes = json.dumps(payload).encode()
        signature = sign_payload(body_bytes, settings.ai_worker_secret)

        try:
            resp = await self._http.post(
                url,
                content=body_bytes,
                headers={
                    'Content-Type': 'application/json',
                    'X-Worker-Signature': signature,
                },
                timeout=10.0,
            )
            if resp.status_code >= 400:
                log.error(
                    '[Dispatcher] Hardware lock request failed. status=%s body=%s',
                    resp.status_code, resp.text[:200]
                )
        except httpx.RequestError as exc:
            log.error('[Dispatcher] Hardware lock request error: %s', exc)


# ─────────────────────────────────────────────────────────────────────────────
# Main correlator
# ─────────────────────────────────────────────────────────────────────────────


class IotCorrelator:
    """
    Orchestrates the full correlation pipeline.

    Usage:
        correlator = IotCorrelator()
        await correlator.run()   # blocks until cancelled
    """

    def __init__(self) -> None:
        self._db_pool: asyncpg.Pool | None = None
        self._redis: aioredis.Redis | None = None
        self._http: httpx.AsyncClient | None = None
        self._flush_tasks: dict[str, asyncio.Task[None]] = {}
        self._evaluator = RuleEvaluator()

    # ── Lifecycle ────────────────────────────────────────────────────────────

    async def start(self) -> None:
        db_dsn = os.environ['SUPABASE_DB_DSN']  # postgres://... direct connection
        redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

        self._db_pool = await asyncpg.create_pool(db_dsn, min_size=2, max_size=5)
        self._redis = aioredis.from_url(redis_url, decode_responses=True)
        self._http = httpx.AsyncClient()
        log.info('[IotCorrelator] Started. DB pool and Redis connected.')

    async def stop(self) -> None:
        for task in self._flush_tasks.values():
            task.cancel()
        if self._flush_tasks:
            await asyncio.gather(*self._flush_tasks.values(), return_exceptions=True)

        if self._http:
            await self._http.aclose()
        if self._redis:
            await self._redis.aclose()
        if self._db_pool:
            await self._db_pool.close()
        log.info('[IotCorrelator] Stopped.')

    async def run(self) -> None:
        """Main loop — LISTEN on the pg_notify channel until cancelled."""
        await self.start()
        assert self._db_pool is not None  # type narrowing

        # Use a dedicated connection for LISTEN (cannot reuse pooled connections)
        listen_conn = await asyncpg.connect(os.environ['SUPABASE_DB_DSN'])
        try:
            await listen_conn.add_listener('iot_event', self._on_notification)
            log.info('[IotCorrelator] LISTEN on channel "iot_event" active.')
            # Block until cancelled
            await asyncio.Future()
        except asyncio.CancelledError:
            log.info('[IotCorrelator] Cancelled, shutting down.')
        finally:
            await listen_conn.remove_listener('iot_event', self._on_notification)
            await listen_conn.close()
            await self.stop()

    # ── Notification handler ─────────────────────────────────────────────────

    def _on_notification(
        self,
        connection: asyncpg.Connection,
        pid: int,
        channel: str,
        payload: str,
    ) -> None:
        """Called synchronously by asyncpg on each NOTIFY — must be non-blocking."""
        try:
            data = json.loads(payload)
            envelope = IotEventEnvelope(
                event_id=data['event_id'],
                company_id=data['company_id'],
                asset_id=data.get('asset_id'),
                event_type=data['event_type'],
                provider=data['provider'],
                received_at=data['received_at'],
            )
        except (KeyError, json.JSONDecodeError) as exc:
            log.error('[IotCorrelator] Bad notify payload: %s | raw=%s', exc, payload[:200])
            return

        # Buffer into Redis and schedule a flush (fire-and-forget)
        asyncio.get_event_loop().create_task(self._buffer_event(envelope))

    # ── Buffering ────────────────────────────────────────────────────────────

    async def _buffer_event(self, envelope: IotEventEnvelope) -> None:
        """Push the event into the Redis sliding window buffer."""
        assert self._redis is not None
        assert self._db_pool is not None

        # Resolve zone context from the asset's zone (or fall back to building)
        zone_id = await self._resolve_zone_id(envelope.asset_id)
        if zone_id:
            zone_key = f'{REDIS_KEY_PREFIX}:{envelope.company_id}:{zone_id}'
        else:
            # No zone — key on building_id if we can get it
            building_id = await self._resolve_building_id(envelope.asset_id)
            bucket = building_id or 'unplaced'
            zone_key = f'{REDIS_KEY_PREFIX}:{envelope.company_id}:bldg:{bucket}'

        import time
        score = time.time()
        member = json.dumps({
            'id': envelope.event_id,
            'event_type': envelope.event_type,
            'provider': envelope.provider,
            'asset_id': envelope.asset_id,
            'received_at': envelope.received_at,
        })
        await self._redis.zadd(zone_key, {member: score})
        # Set TTL so orphaned keys don't accumulate (2× window + buffer)
        await self._redis.expire(zone_key, DEFAULT_WINDOW_SECONDS * 4)

        self._schedule_flush(zone_key, envelope)

    def _schedule_flush(self, zone_key: str, envelope: IotEventEnvelope) -> None:
        """Ensure exactly one flush task per zone_key is running."""
        if zone_key in self._flush_tasks and not self._flush_tasks[zone_key].done():
            return  # Already scheduled
        task = asyncio.get_event_loop().create_task(
            self._flush_window(zone_key, envelope)
        )
        self._flush_tasks[zone_key] = task

    # ── Window flush ─────────────────────────────────────────────────────────

    async def _flush_window(self, zone_key: str, envelope: IotEventEnvelope) -> None:
        """Wait for the correlation window then evaluate and dispatch."""
        await asyncio.sleep(DEFAULT_WINDOW_SECONDS)

        assert self._redis is not None
        assert self._db_pool is not None

        import time
        now = time.time()
        window_start = now - DEFAULT_WINDOW_SECONDS

        # Fetch all events within the window
        raw_members = await self._redis.zrangebyscore(
            zone_key, window_start, now
        )
        if not raw_members:
            self._flush_tasks.pop(zone_key, None)
            return

        # Clear consumed events from Redis
        await self._redis.zremrangebyscore(zone_key, window_start, now)

        # Parse buffered event metadata
        buffered = []
        for raw in raw_members:
            try:
                buffered.append(json.loads(raw))
            except json.JSONDecodeError:
                continue

        # Enrich with full DB rows (raw_payload needed for deep inspection)
        event_ids = [e['id'] for e in buffered]
        full_events = await self._fetch_events(event_ids)

        # Normalize raw vendor payloads via the adapter layer.
        # Each event gets an 'normalized' key so RuleEvaluator can use
        # vendor-agnostic fields instead of peeking at proprietary JSON.
        for evt in full_events:
            raw = evt.get('raw_payload') or {}
            # asyncpg returns JSONB as dict; guard against the string case
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except json.JSONDecodeError:
                    raw = {}
            adapter = get_adapter(evt.get('provider', ''))
            evt['normalized'] = adapter.normalize(raw)

        # Resolve zone type for risk classification
        zone_id = await self._resolve_zone_id(envelope.asset_id)
        zone_type = await self._fetch_zone_type(zone_id) if zone_id else None
        zone_risk = self._classify_zone_risk(zone_type)

        # Load active company rules
        db_rules = await self._fetch_rules(envelope.company_id)

        # Evaluate
        result = await self._evaluator.evaluate(full_events, zone_risk, db_rules)

        # Dispatch
        building_id = await self._resolve_building_id(envelope.asset_id)
        dispatcher = ActionDispatcher(self._db_pool, self._http)  # type: ignore[arg-type]
        await dispatcher.execute(result, envelope, building_id, envelope.asset_id)

        self._flush_tasks.pop(zone_key, None)

    # ── DB helpers ────────────────────────────────────────────────────────────

    async def _resolve_zone_id(self, asset_id: str | None) -> str | None:
        if not asset_id:
            return None
        assert self._db_pool is not None
        row = await self._db_pool.fetchrow(
            "SELECT zone_id FROM public.erp_physical_assets WHERE id = $1::uuid",
            asset_id,
        )
        return str(row['zone_id']) if row and row['zone_id'] else None

    async def _resolve_building_id(self, asset_id: str | None) -> str | None:
        if not asset_id:
            return None
        assert self._db_pool is not None
        row = await self._db_pool.fetchrow(
            """
            SELECT
                COALESCE(
                    pa.building_id,
                    f.building_id,
                    z.building_id
                )::text AS building_id
            FROM public.erp_physical_assets pa
            LEFT JOIN public.erp_floors f ON pa.floor_id = f.id
            LEFT JOIN public.erp_zones  z ON pa.zone_id  = z.floor_id
            WHERE pa.id = $1::uuid
            """,
            asset_id,
        )
        return row['building_id'] if row else None

    async def _fetch_zone_type(self, zone_id: str) -> str | None:
        assert self._db_pool is not None
        row = await self._db_pool.fetchrow(
            "SELECT zone_type FROM public.erp_zones WHERE id = $1::uuid",
            zone_id,
        )
        return str(row['zone_type']) if row else None

    async def _fetch_events(self, event_ids: list[str]) -> list[dict[str, Any]]:
        assert self._db_pool is not None
        rows = await self._db_pool.fetch(
            """
            SELECT id::text, event_type, raw_payload, asset_id::text, provider
            FROM public.erp_iot_events
            WHERE id = ANY($1::uuid[])
              AND processed = false
            """,
            event_ids,
        )
        return [dict(r) for r in rows]

    async def _fetch_rules(self, company_id: str) -> list[dict[str, Any]]:
        assert self._db_pool is not None
        rows = await self._db_pool.fetch(
            """
            SELECT id::text, rule_name, is_active, required_event_types,
                   correlation_window_sec, same_zone_required, same_building_required,
                   action_type, wo_params, rule_priority, matched_rule_id
            FROM public.erp_iot_rules
            WHERE company_id = $1
              AND is_active = true
            ORDER BY rule_priority ASC
            """,
            company_id,
        )
        result = []
        for r in rows:
            d = dict(r)
            # wo_params is stored as JSONB — asyncpg returns it as str
            if isinstance(d.get('wo_params'), str):
                d['wo_params'] = json.loads(d['wo_params'])
            result.append(d)
        return result

    # ── Risk classification ──────────────────────────────────────────────────

    @staticmethod
    def _classify_zone_risk(zone_type: str | None) -> ZoneRiskLevel:
        if not zone_type:
            return ZoneRiskLevel.UNKNOWN
        if zone_type in STERILE_ZONE_TYPES:
            return ZoneRiskLevel.STERILE
        if zone_type in PUBLIC_ZONE_TYPES:
            return ZoneRiskLevel.PUBLIC
        return ZoneRiskLevel.UNKNOWN


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint (for running standalone: python -m crews.iot_correlator)
# ─────────────────────────────────────────────────────────────────────────────


async def main() -> None:
    logging.basicConfig(
        level=settings.log_level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    )
    correlator = IotCorrelator()
    try:
        await correlator.run()
    except KeyboardInterrupt:
        log.info('Interrupted by user.')


if __name__ == '__main__':
    asyncio.run(main())
