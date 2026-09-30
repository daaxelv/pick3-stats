"""Download official ACS table B19013; ZIPs are matched to same-code ZCTAs."""
import csv, io, json, pathlib, urllib.request
from datetime import datetime, timezone
ROOT = pathlib.Path('scratchoffs/data')
URL = 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b19013.dat'
def value(raw):
    try:
        n=int(raw)
        return n if n >= 0 else None
    except ValueError:
        return None

def collect():
    with urllib.request.urlopen(URL, timeout=180) as response:
        rows=csv.DictReader(io.StringIO(response.read().decode('utf-8-sig')), delimiter='|')
        entries={}
        for row in rows:
            geo=row['GEO_ID']
            if geo.startswith('860Z200US'):
                zipcode=geo[-5:]
                if zipcode.startswith(('07','08')):
                    entries[zipcode]={'median_income':value(row['B19013_E001']), 'margin_of_error':value(row['B19013_M001'])}
    if len(entries)<400:
        raise ValueError('Incomplete NJ-area ZCTA income table; previous snapshot retained')
    output={'updated_at':datetime.now(timezone.utc).isoformat(),'period':'2020–2024','dollar_year':2024,'table':'B19013','source_url':URL,'entries':entries}
    temp=ROOT/'income.json.tmp';temp.write_text(json.dumps(output,separators=(',',':')));temp.replace(ROOT/'income.json')
    print(f'Collected {len(entries)} ZIP-code tabulation areas')
if __name__=='__main__': collect()
