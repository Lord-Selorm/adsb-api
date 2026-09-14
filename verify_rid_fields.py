import os
import re
import json
from pathlib import Path

# Load extracted manual texts
MANUALS_DIR = Path('docs/manuals_extracted')

# Expected fields based on rid.decoder.ts mapping
EXPECTED_FIELDS = {
    'serial_number': ['serial_number', 'uav_sn'],
    'longitude': ['longitude', 'uav_lon'],
    'latitude': ['latitude', 'uav_lat'],
    'height': ['height', 'uav_height'],
    'v_hor': ['v_hor', 'uav_v_hor'],
    # additional optional fields can be added as needed
}

def extract_fields(text: str):
    # Simple regex to find field definitions like "uav_sn: <description>"
    fields = set()
    for line in text.splitlines():
        line = line.strip()
        for alias_list in EXPECTED_FIELDS.values():
            for alias in alias_list:
                if re.search(r'\b' + re.escape(alias) + r'\b', line, re.IGNORECASE):
                    fields.add(alias.lower())
    return fields

def main():
    report = {}
    for manual_path in MANUALS_DIR.glob('*.txt'):
        text = manual_path.read_text(encoding='utf-8')
        found = extract_fields(text)
        missing = []
        for canonical, aliases in EXPECTED_FIELDS.items():
            if not any(a.lower() in found for a in aliases):
                missing.append(canonical)
        report[manual_path.name] = {
            'found_fields': sorted(list(found)),
            'missing_fields': missing,
        }
    print(json.dumps(report, indent=2))
    # Optionally write report to file
    (MANUALS_DIR / 'rid_field_verification_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
