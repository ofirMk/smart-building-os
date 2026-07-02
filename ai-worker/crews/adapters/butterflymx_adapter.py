"""
ButterflyMX intercom and door-release webhook adapter.

ButterflyMX sends events via an 'event' string field using snake_case.
Door timing (when relevant) is in 'duration_seconds'.

Reference: https://www.butterflymx.com/docs/webhooks/
"""
from __future__ import annotations

from .base_adapter import NormalizedEvent, VendorAdapter

# Events that carry a direct security implication
_BREACH_EVENTS = frozenset({
    'door_forced_open',
    'alarm_triggered',
    'tamper_detected',
})

# Standard door-release or package-room events
_ACCESS_EVENTS = frozenset({
    'door_released',
    'package_room_door_opened',
    'delivery_made',
    'virtual_key_used',
})


class ButterflyMXAdapter(VendorAdapter):
    """
    Normalizes ButterflyMX intercom and access event payloads.

    Example payloads
    ----------------
    Intercom call from resident:
        {
          "event": "call_made",
          "unit_name": "1A",
          "resident_id": "r123",
          "timestamp": "2026-07-03T10:00:00Z"
        }

    Door released by resident:
        {
          "event": "door_released",
          "door_name": "Main Entrance",
          "released_by": "resident",
          "timestamp": "2026-07-03T10:00:05Z"
        }

    Package room access:
        { "event": "package_room_door_opened", "door_name": "Package Room" }

    Door held open for 90 s:
        {
          "event": "door_held_open",
          "door_name": "Main Entrance",
          "duration_seconds": 90
        }

    Alarm:
        { "event": "alarm_triggered", "door_name": "Side Gate" }
    """

    def _parse(self, raw_payload: dict) -> NormalizedEvent:
        event: str = (raw_payload.get('event') or '').lower()

        door_held_seconds: int = int(
            raw_payload.get('duration_seconds')
            or raw_payload.get('door_held_seconds')
            or 0
        )

        if event == 'call_made':
            return NormalizedEvent(
                event_category='access',
                specific_type='intercom_call',
                # Each intercom call implies at least one person at the entry
                person_count=1,
                door_held_seconds=0,
                is_security_breach=False,
            )

        if event in _ACCESS_EVENTS:
            return NormalizedEvent(
                event_category='access',
                specific_type='door_open',
                person_count=1,
                door_held_seconds=0,
                is_security_breach=False,
            )

        if event == 'door_forced_open':
            return NormalizedEvent(
                event_category='anomaly',
                specific_type='door_forced',
                person_count=0,
                door_held_seconds=0,
                is_security_breach=True,
            )

        if event == 'door_held_open':
            return NormalizedEvent(
                event_category='anomaly',
                specific_type='door_held',
                person_count=0,
                door_held_seconds=door_held_seconds,
                is_security_breach=False,
            )

        if event in _BREACH_EVENTS:
            return NormalizedEvent(
                event_category='anomaly',
                specific_type='alarm',
                person_count=0,
                door_held_seconds=0,
                is_security_breach=True,
            )

        # Unknown ButterflyMX event
        return NormalizedEvent(
            event_category='telemetry',
            specific_type='unknown',
            person_count=0,
            door_held_seconds=door_held_seconds,
            is_security_breach=False,
        )
