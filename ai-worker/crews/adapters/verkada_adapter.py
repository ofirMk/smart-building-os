"""
Verkada Camera & Access Control webhook adapter.

Verkada sends two broad payload families:
  1. Camera analytics  — person_count, anomaly_type, occupancy, line_crossing
  2. Access control    — door_access_granted, door_forced_open, door_held_open

Reference: https://apidocs.verkada.com/reference/webhooks
"""
from __future__ import annotations

from .base_adapter import NormalizedEvent, VendorAdapter

# Anomaly types that Verkada's computer-vision pipeline emits
_SECURITY_ANOMALIES = frozenset({
    'tailgate',
    'forced_entry',
    'intrusion',
    'loitering',
})


class VerkadaAdapter(VendorAdapter):
    """
    Normalizes Verkada Camera and Access Control webhook payloads.

    Example payloads
    ----------------
    Tailgate anomaly:
        {
          "event_type": "anomaly_alert",
          "anomaly_type": "tailgate",
          "person_count": 2,
          "camera_id": "...",
          "timestamp": "2026-07-03T10:00:00Z"
        }

    Occupancy / line-crossing:
        {
          "event_type": "occupancy_alert",
          "occupancy": { "count": 3, "direction": "in" },
          "line_crossing": { "count": 1 }
        }

    Access control:
        {
          "event_type": "door_access_granted",
          "door_id": "...",
          "credential_type": "badge"
        }

    Door held:
        {
          "event_type": "door_held_open",
          "door_id": "...",
          "door_held_seconds": 60
        }
    """

    def _parse(self, raw_payload: dict) -> NormalizedEvent:
        event_type: str = (raw_payload.get('event_type') or '').lower()
        anomaly_type: str = (raw_payload.get('anomaly_type') or '').lower()

        # ── Person count (three possible locations in Verkada payloads) ──────
        person_count: int = int(raw_payload.get('person_count') or 0)
        if person_count == 0:
            occupancy = raw_payload.get('occupancy')
            if isinstance(occupancy, dict):
                person_count = int(occupancy.get('count') or 0)
        if person_count == 0:
            line_crossing = raw_payload.get('line_crossing')
            if isinstance(line_crossing, dict):
                person_count = int(line_crossing.get('count') or 0)

        # ── Door held seconds ────────────────────────────────────────────────
        door_held_seconds: int = int(
            raw_payload.get('door_held_seconds')
            or raw_payload.get('door_open_seconds')
            or 0
        )

        # ── Security breach flag ─────────────────────────────────────────────
        is_security_breach: bool = (
            anomaly_type in _SECURITY_ANOMALIES
            or 'forced' in event_type
        )

        # ── Classify into standard categories ───────────────────────────────
        if anomaly_type in _SECURITY_ANOMALIES:
            return NormalizedEvent(
                event_category='anomaly',
                specific_type=anomaly_type,          # e.g. 'tailgate'
                person_count=person_count,
                door_held_seconds=door_held_seconds,
                is_security_breach=True,
            )

        if 'forced' in event_type:
            return NormalizedEvent(
                event_category='anomaly',
                specific_type='door_forced',
                person_count=person_count,
                door_held_seconds=0,
                is_security_breach=True,
            )

        if 'held_open' in event_type or 'left_open' in event_type:
            return NormalizedEvent(
                event_category='anomaly',
                specific_type='door_held',
                person_count=0,
                door_held_seconds=door_held_seconds,
                is_security_breach=False,
            )

        if 'access_granted' in event_type or 'door_open' in event_type:
            return NormalizedEvent(
                event_category='access',
                specific_type='door_open',
                person_count=person_count,
                door_held_seconds=0,
                is_security_breach=False,
            )

        if 'access_denied' in event_type:
            return NormalizedEvent(
                event_category='access',
                specific_type='access_denied',
                person_count=0,
                door_held_seconds=0,
                is_security_breach=False,
            )

        if 'occupancy' in event_type or 'line_crossing' in event_type:
            return NormalizedEvent(
                event_category='telemetry',
                specific_type='occupancy_update',
                person_count=person_count,
                door_held_seconds=0,
                is_security_breach=False,
            )

        # Unknown Verkada event type — preserve whatever we could extract
        return NormalizedEvent(
            event_category='telemetry',
            specific_type='unknown',
            person_count=person_count,
            door_held_seconds=door_held_seconds,
            is_security_breach=is_security_breach,
        )
