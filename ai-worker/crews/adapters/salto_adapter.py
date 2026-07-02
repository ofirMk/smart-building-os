"""
Salto KS cloud webhook adapter.

Salto KS sends strongly-typed event objects with a 'type' field using
PascalCase identifiers.  Door timing data is in 'door_open_time' (seconds).

Reference: https://saltoks.developer.salto.com/docs/webhooks
"""
from __future__ import annotations

from .base_adapter import NormalizedEvent, VendorAdapter

# Events that indicate the door was physically forced or an alarm was raised
_FORCED_TYPES = frozenset({
    'DoorForcedOpen',
    'IntrusionDetected',
    'TamperDetected',
    'EmergencyOpen',
})

# Events where the door was held open longer than intended
_HELD_TYPES = frozenset({
    'DoorLeftOpen',
    'DoorHeldOpen',
    'DoorNotClosed',
})

# Normal access events
_OPEN_TYPES = frozenset({
    'DoorOpened',
    'AccessGranted',
    'RemoteOpen',
    'KeypadOpen',
})

# Denial / privacy events
_DENIED_TYPES = frozenset({
    'AccessDenied',
    'PrivacyModeEnabled',
    'BlockedUser',
    'UnknownCard',
})


class SaltoAdapter(VendorAdapter):
    """
    Normalizes Salto KS cloud webhook payloads.

    Example payloads
    ----------------
    Door forced open:
        { "type": "DoorForcedOpen", "door_id": "abc123", "site_id": "site1" }

    Door held open (72 s):
        { "type": "DoorLeftOpen", "door_id": "abc123", "door_open_time": 72 }

    Standard access:
        { "type": "AccessGranted", "door_id": "abc123", "user_id": "u42" }

    Intrusion:
        { "type": "IntrusionDetected", "zone_id": "zone7" }
    """

    def _parse(self, raw_payload: dict) -> NormalizedEvent:
        salto_type: str = raw_payload.get('type') or ''

        # Salto sometimes nests timing under 'door_open_time' (int, seconds)
        door_held_seconds: int = int(
            raw_payload.get('door_open_time')
            or raw_payload.get('door_held_seconds')
            or 0
        )

        if salto_type in _FORCED_TYPES:
            return NormalizedEvent(
                event_category='anomaly',
                specific_type='door_forced',
                person_count=0,
                door_held_seconds=0,
                is_security_breach=True,
            )

        if salto_type in _HELD_TYPES:
            return NormalizedEvent(
                event_category='anomaly',
                specific_type='door_held',
                person_count=0,
                door_held_seconds=door_held_seconds,
                is_security_breach=False,
            )

        if salto_type in _OPEN_TYPES:
            return NormalizedEvent(
                event_category='access',
                specific_type='door_open',
                person_count=0,
                door_held_seconds=0,
                is_security_breach=False,
            )

        if salto_type in _DENIED_TYPES:
            return NormalizedEvent(
                event_category='access',
                specific_type='access_denied',
                person_count=0,
                door_held_seconds=0,
                is_security_breach=False,
            )

        # Unknown Salto event — carry whatever timing data is available
        return NormalizedEvent(
            event_category='telemetry',
            specific_type='unknown',
            person_count=0,
            door_held_seconds=door_held_seconds,
            is_security_breach=False,
        )
