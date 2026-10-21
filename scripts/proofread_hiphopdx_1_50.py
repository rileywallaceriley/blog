#!/usr/bin/env python3
"""One-time, conservative HipHopDX articles 1-50 copyedit.
Preserve provenance in raw_content and all records outside batch.
"""
import json
from pathlib import Path
path = Path("posts_hiphopdx.json")
original = path.read_text(encoding="utf-8")
data = json.loads(original)
assert len(data) == 858, "Record count unexpectedly changed"
rules = json.loads(r'''[[0,"Soundtracks of recent day","Recent soundtracks"],[0,"JAY-Z featured","JAY-Z-featured"],[0,"lacking in energy, that","lacking in energy that"],[1,"new exciting territory","exciting new territory"],[3,"This, of course, isn't something he didn't foresee ruffling feathers","This, of course, is something he foresaw ruffling feathers"],[3,"Arguably one of the finest Stove God verses in his catalog, as he shines his coke-rap crown with lines like,","Stove God delivers arguably one of the finest verses in his catalog, shining his coke-rap crown with lines like,"],[3,"Does feel like Gunn melded two juxtaposed projects together.","It does feel like Gunn melded two contrasting projects together."],[3,"One providing elite-level material polished","One provides elite-level material polished"],[4,"I just take my time.\" I've put so much work","I just take my time.\" \"I've put so much work"],[6,"Wet Appetites","Whet Appetites"],[7,"A hard, unpopular stance and standing on it is","Taking a hard, unpopular stance and standing by it is"],[9,"SWARM's NI'Jah has writing credits","SWARM's NI'Jah, with writing credits"],[11,"unconventional blow up","unconventional rise"],[11,"the Neptunes-sample international smash single","the Neptunes-sampling international smash single"],[11,"\"Billy Eilish\" producer","\"Billie Eilish\" producer"],[11,"Neptune's hit","Neptunes hit"],[11,"His past projects, like the heart-wrenching","On his past projects, like the heart-wrenching"],[11,"Armani had found a way to balance","Armani found a way to balance"],[12,"Drea D \"Nur featured \"Kanye,\"","Drea D Nur-featured \"Kanye,\""],[13,"On the latter record, \"Alter Ego,\"","On \"Alter Ego,\""],[14,"It shouldn't be overstated how difficult it is","It's difficult to overstate how challenging it is"],[17,"Skyzoo \"The Mind of a Saint\" Is","Skyzoo's \"The Mind of a Saint\" Is"],[22,"Though, with this level of cohesive quality","With this level of cohesive quality"],[25,"The show is free admission — and all ages.","The show is free to attend and open to all ages."],[36,"grimey","grimy"],[47,"Though with a tape like this,","With a tape like this,"],[48,"\"Overall\" f. Chinx \"Longevity\" f. French Montana","\"Overall\" f. Chinx; \"Longevity\" f. French Montana"],[49,"soon. Repeat-Me: \"Wants and Needs\" f. Lil Baby; \"Lemon Pepper Freestyle\" f. Rick Ross.</p><p>Fan Feedback:","soon.</p><p>Repeat-Me: \"Wants and Needs\" f. Lil Baby; \"Lemon Pepper Freestyle\" f. Rick Ross.</p><p>Fan Feedback:"]]''')
touched = set()
applied = 0
for index, old, new in rules:
    fields = ("title",) if index in (6, 17) else ("clean_content", "content")
    for field in fields:
        value = data[index][field]
        if old in value:
            assert value.count(old) == 1, f"Ambiguous replacement: {index + 1}/{field}"
            data[index][field] = value.replace(old, new, 1)
            touched.add(index + 1)
            applied += 1
            print(f"Edited article {index + 1}, {field}: {old[:60]}")
assert all(1 <= i <= 50 for i in touched)
assert all(row.get("raw_content") for row in data)
result = json.dumps(data, ensure_ascii=False, indent=2)
# Match repository's existing JSON serialization, escaping behavior and layout.
result = json.dumps(data, indent=2)
assert len(json.loads(result)) == 858
path.write_text(result, encoding="utf-8")
print(f"PASS: {len(touched)} articles changed, {applied} fields edited; 858 entries preserved.")
