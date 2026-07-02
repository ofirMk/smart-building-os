"""
Base adapter contract for vendor IoT payload normalization.

Every vendor adapter MUST:
  1. Extend VendorAdapter
  2. Implement _parse(raw_payload) -> NormalizedEvent
  3. NOT call normalize() directly — the base class wraps _parse() with a
     try/except so a schema change from any vendor can never crash the loop.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TypedDict

log = logging.getLogger(__name__)


class NormalizedEvent(TypedDict):
    """
    Vendor-agnostic event representation fed into RuleEvaluator.

    Fields
    ------
    event_category    : 'access' | 'anomaly' | 'telemetry'
    specific_type     : 'door_open' | 'door_forced' | 'door_held' | 'tailgate' |
                        'intercom_call' | 'access_denied' | 'occupancy_update' |
                        'alarm' | 'unknown'
    person_count      : Number of individuals detected in the event frame (0 if N/A)
    door_held_seconds : How long the door was held open (0 if N/A)
    is_security_breach: True when the vendor hardware explicitly flagged this as
                        a security violation (tailgate, forced entry, alarm, etc.)
    """
    event_category: str
    specific_type: str
    person_count: int
    door_held_seconds: int
    is_security_breach: bool


# Safe fallback returned when parsing fails entirely
_FALLBACK: NormalizedEvent = {
    'event_category': 'telemetry',
    'specific_type': 'unknown',
    'person_count': 0,
    'door_held_seconds': 0,
    'is_security_breach': False,
}


class VendorAdapter(ABC):
    """
    Abstract base for all vendor-specific payload adapters.

    Subclasses implement `_parse()`.  Callers always use the public
    `normalize()` method which catches any exception and returns the safe
    fallback so a bad vendor payload can never crash the async loop.
    """

    @abstractmethod
    def _parse(self, raw_payload: dict) -> NormalizedEvent:
        """
        Vendor-specific parsing logic.
        Raise freely — the base class will catch and log.
        """
        ...

    def normalize(self, raw_payload: dict) -> NormalizedEvent:
        """
        Safe normalization entry point.

        On any exception: logs the error including the payload key names (not
        values, to avoid leaking PII) and returns FALLBACK_NORMALIZED.
        """
        if not isinstance(raw_payload, dict):
            log.error(
                '[%s] raw_payload is not a dict (got %s) — using fallback.',
                self.__class__.__name__, type(raw_payload).__name__,
            )
            return dict(_FALLBACK)  # type: ignore[return-value]

        try:
            return self._parse(raw_payload)
        except Exception as exc:
            log.error(
                '[%s] Failed to parse payload — using fallback. '
                'error=%s payload_keys=%s',
                self.__class__.__name__,
                exc,
                list(raw_payload.keys()),
            )
            return dict(_FALLBACK)  # type: ignore[return-value]
