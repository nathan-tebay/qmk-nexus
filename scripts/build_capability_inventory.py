"""Regenerate the conservative Nexus runtime capability inventory."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
index = json.loads((ROOT / 'backend/data/qmk_index.json').read_text())
modules = (ROOT / 'frontend/src/stages/build/modules.ts').read_text()
module_ids = re.findall(r"^    id: '([^']+)', name:", modules, re.M)
selected = {
    'ergodox_ez/base': 'physical AVR candidate',
    'hotdox': 'physical AVR candidate',
    'hotdox76v2': 'physical AVR candidate',
}
rows = []
for board in index:
    path = board['path']
    rows.append({
        'board': path, 'mcu': board.get('mcu') or 'unknown',
        'module': 'base_keyboard', 'configuration': 'imported_default',
        'status': 'experimental' if path in selected else 'unsupported',
        'reason': ('Selected for validation; no physical flash or USB result' if path in selected
                   else 'Imported catalog entry only; no Nexus runtime validation'),
        'evidence': ['backend/data/qmk_index.json', f'backend/data/keyboards/{path}.json'],
    })

for board_path in selected:
    board = next(b for b in index if b['path'] == board_path)
    for module in module_ids:
        rows.append({
            'board': board_path, 'mcu': board.get('mcu') or 'unknown',
            'module': module, 'configuration': 'editor_default',
            'status': 'unsupported',
            'reason': 'Editor exposes this option; no independent runtime or hardware validation',
            'evidence': ['frontend/src/stages/build/modules.ts', 'backend/models.py'],
        })

data = {
    'schema_version': 1,
    'runtime': 'nexus_independent',
    'default_status': 'unsupported',
    'default_reason': 'Any board/module/configuration combination absent from rows is unvalidated',
    'source': {'qmk_index': 'backend/data/qmk_index.json', 'editor': 'frontend/src/stages/build/modules.ts'},
    'rows': sorted(rows, key=lambda r: (r['board'], r['module'], r['configuration'])),
}
out = ROOT / 'baseline/capabilities.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(data, indent=2) + '\n')
print(f'{len(index)} board entries; {len(module_ids)} editor modules; {len(rows)} rows -> {out}')
