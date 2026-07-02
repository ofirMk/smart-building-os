"""
Vendor adapter package — Hardware Driver Abstraction Layer.

Usage
-----
    from crews.adapters import get_adapter

    adapter = get_adapter(event['provider'])
    normalized = adapter.normalize(event['raw_payload'])

Factory
-------
`get_adapter(provider)` performs a case-insensitive lookup in the registry.
Unknown vendors receive a `_PassthroughAdapter` that does best-effort field
extraction rather than failing silently.
"""
from __future__ import annotations

import logging

from .base_adapter import NormalizedEvent, VendorAdapter
from .butterflymx_adapter import ButterflyMXAdapter
from .salto_adapter import SaltoAdapter
from .verkada_adapter import VerkadaAdapter

log = logging.getLogger(__name__)

# ── Adapter registry ──────────────────────────────────────────────────────────
# Keys are lowercased provider identifiers from erp_iot_events.provider.
# Add new vendors here; no changes needed elsewhere.
_REGISTRY: dict[str, type[VendorAdapter]] = {
    'verkada':     VerkadaAdapter,
    'salto':       SaltoAdapter,
    'butterflymx': ButterflyMXAdapter,
}


def get_adapter(provider: str) -> VendorAdapter:
    """
    Return the correct VendorAdapter for the given provider string.

    Lookup is case-insensitive and strips hyphens/underscores so that
    'ButterflyMX', 'butterflymx', 'butterfly-mx', and 'butterfly_mx'
    all resolve correctly.

    Falls back to `_PassthroughAdapter` for unknown vendors so the
    correlation loop never raises on an unrecognised provider value.
    """
    normalised_key = (provider or '').lower().replace('-', '').replace('_', '')

    # Try the normalised form first, then the raw lowercase form
    adapter_cls = _REGISTRY.get(normalised_key) or _REGISTRY.get((provider or '').lower())

    if adapter_cls is None:
        log.warning(
            '[AdapterFactory] Unknown provider %r — using passthrough adapter.',
            provider,
        )
        return _PassthroughAdapter()

    return adapter_cls()


# ── Passthrough adapter (fallback for unlisted vendors) ──────────────────────

class _PassthroughAdapter(VendorAdapter):
    """
    Best-effort adapter for unknown / custom vendors.

    Reads the most commonly used field names across all three supported vendors
    so that a new integration still gets partial normalisation even before a
    dedicated adapter is written.
    """

    def _parse(self, raw_payload: dict) -> NormalizedEvent:
        anomaly_type: str = (raw_payload.get('anomaly_type') or '').lower()
        event_type: str = (
            raw_payload.get('event_type')
            or raw_payload.get('type')
            or raw_payload.get('event')
            or ''
        ).lower()

        person_count: int = int(raw_payload.get('person_count') or 0)
        door_held_seconds: int = int(
            raw_payload.get('door_held_seconds')
            or raw_payload.get('door_open_seconds')
            or raw_payload.get('duration_seconds')
            or 0
        )

        is_security_breach: bool = (
            anomaly_type in ('tailgate', 'forced_entry', 'intrusion')
            or 'forced' in event_type
            or 'tailgate' in event_type
        )

        if is_security_breach or anomaly_type:
            event_category = 'anomaly'
            specific_type = anomaly_type or 'unknown_anomaly'
        elif 'open' in event_type or 'access' in event_type or 'granted' in event_type:
            event_category = 'access'
            specific_type = 'door_open'
        elif 'denied' in event_type:
            event_category = 'access'
            specific_type = 'access_denied'
        else:
            event_category = 'telemetry'
            specific_type = 'unknown'

        return NormalizedEvent(
            event_category=event_category,
            specific_type=specific_type,
            person_count=person_count,
            door_held_seconds=door_held_seconds,
            is_security_breach=is_security_breach,
        )


__all__ = [
    'NormalizedEvent',
    'VendorAdapter',
    'VerkadaAdapter',
    'SaltoAdapter',
    'ButterflyMXAdapter',
    'get_adapter',
]
