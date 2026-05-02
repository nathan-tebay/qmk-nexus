"""Layout reconciliation — preserve keycodes when switching layouts."""
from __future__ import annotations

from models import KeyDef, Layer


def reconcile_layers(
    old_keys: list[KeyDef],
    old_layers: list[Layer],
    new_keys: list[KeyDef],
) -> tuple[list[Layer], int]:
    """Reconcile layers from ``old_keys`` to ``new_keys``, preserving keycodes
    where possible.

    Strategy:
        1. If both old and new keys carry matrix coordinates, match by
           ``(row, col)``. This is the strongest form of identity — a key at
           a given matrix position is "the same key" across layouts.
        2. Otherwise, if the key counts match, fall back to positional index
           copy.
        3. If neither holds, no keycodes are copied.

    Returns:
        ``(new_layers, discarded_count)`` where ``discarded_count`` is the
        number of old keys that had a non-trivial keycode in any layer but
        no matching position in the new layout.
    """
    # Build lookup: (row, col) → old key id, for keys with matrix data
    old_by_matrix: dict[tuple[int, int], str] = {}
    for k in old_keys:
        if k.row is not None and k.col is not None:
            old_by_matrix[(k.row, k.col)] = k.id

    # Build lookup: position_index → old key id
    old_by_index: dict[int, str] = {i: k.id for i, k in enumerate(old_keys)}

    # Does the key count match? (for positional fallback)
    counts_match = len(old_keys) == len(new_keys)

    # Does new layout have matrix data?
    new_has_matrix = any(k.row is not None and k.col is not None for k in new_keys)
    old_has_matrix = any(k.row is not None and k.col is not None for k in old_keys)
    use_matrix = new_has_matrix and old_has_matrix

    new_layers: list[Layer] = []
    matched_old_ids: set[str] = set()

    for old_layer in old_layers:
        new_keycodes: dict[str, str] = {}

        for new_idx, new_key in enumerate(new_keys):
            old_key_id: str | None = None

            # Try matrix match first
            if use_matrix and new_key.row is not None and new_key.col is not None:
                old_key_id = old_by_matrix.get((new_key.row, new_key.col))

            # Fallback to positional index if counts match
            if old_key_id is None and not use_matrix and counts_match:
                old_key_id = old_by_index.get(new_idx)

            if old_key_id and old_key_id in old_layer.keycodes:
                kc = old_layer.keycodes[old_key_id]
                if kc:  # don't copy empty string
                    new_keycodes[new_key.id] = kc
                    matched_old_ids.add(old_key_id)
            # else: leave unassigned (KC_TRNS / blank implied)

        new_layers.append(Layer(
            id=old_layer.id,
            name=old_layer.name,
            keycodes=new_keycodes,
        ))

    # Count discarded positions: old keys with non-trivial keycodes that
    # didn't get matched into the new layout.
    discarded = 0
    trivial = {'KC_TRNS', 'KC_NO', 'XXXXXXX', ''}
    for old_key in old_keys:
        if old_key.id in matched_old_ids:
            continue
        for layer in old_layers:
            kc = layer.keycodes.get(old_key.id, '')
            if kc and kc not in trivial:
                discarded += 1
                break

    return new_layers, discarded
