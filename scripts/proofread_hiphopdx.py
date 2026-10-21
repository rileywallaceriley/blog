#!/usr/bin/env python3
"""Conservative, repeatable proofreading pass for the HipHopDX JSON archive.
Leaves raw_content and all article metadata untouched.
"""
import json
import re
from pathlib import Path

FILE = Path("posts_hiphopdx.json")
REPLACEMENTS = [
  [
    168,
    [
      "content",
      "clean_content"
    ],
    "Of the reluctance to accept a new name may stem",
    "Part of the reluctance to accept a new name may stem"
  ],
  [
    168,
    [
      "content",
      "clean_content"
    ],
    "though he admits that it in the same way it motivated him",
    "though he admits that, in the same way it motivated him"
  ],
  [
    199,
    [
      "content",
      "clean_content"
    ],
    "The Dungeon Family Reunion Tour this past April and their first release in six years",
    "Following the Dungeon Family Reunion Tour this past April and their first release in six years"
  ],
  [
    199,
    [
      "clean_content"
    ],
    "\"It was just dope. It was a dope experience for the audience,\" interjects",
    "\"It was just dope. It was a dope experience for the audience,\" Khujo interjects"
  ],
  [
    199,
    [
      "content"
    ],
    "It was just dope. It was a dope experience for the audience.\"interjects",
    "It was just dope. It was a dope experience for the audience,\" Khujo interjects"
  ],
  [
    745,
    [
      "content",
      "clean_content"
    ],
    "Bad Bad Entertainment",
    "Bad Boy Entertainment"
  ],
  [
    739,
    [
      "content",
      "clean_content"
    ],
    "Quality Control Control The Streets Vol 1",
    "Quality Control's Control the Streets, Vol. 1"
  ],
  [
    49,
    [
      "clean_content"
    ],
    "\"Wants and Needs\" f. Lil Baby \"Lemon Pepper Freestyle\" f.</p><p>Rick Ross Fan Feedback:",
    "\"Wants and Needs\" f. Lil Baby; \"Lemon Pepper Freestyle\" f. Rick Ross.</p><p>Fan Feedback:"
  ],
  [
    49,
    [
      "content"
    ],
    "\" Want and Needs\"f. Lil Baby\" Lemon Pepper Freestyle\"f.\n\nRick RossFan Feedback:",
    "\" Wants and Needs\" f. Lil Baby; \"Lemon Pepper Freestyle\" f. Rick Ross.\n\nFan Feedback:"
  ],
  [
    493,
    [
      "content"
    ],
    "we'll get finally hear all the blood sweat and tears",
    "we'll finally get to hear all the blood, sweat and tears"
  ],
  [
    775,
    [
      "content"
    ],
    "It's essential to just to treat people with respect",
    "It's essential to just treat people with respect"
  ],
  [
    817,
    [
      "content",
      "clean_content"
    ],
    "Rapper Danny Brown named his favs:",
    "Rapper Danny Brown named his favs."
  ],
  [
    775,
    [
      "clean_content"
    ],
    "<p>What makes a great producer?",
    "<p><strong>What makes a great producer?</strong>"
  ],
  [
    738,
    [
      "clean_content"
    ],
    "<p>So, 25 years after the Black Sheep debut, what keeps Dres motivated?",
    "<p><strong>So, 25 years after the Black Sheep debut, what keeps Dres motivated?</strong>"
  ],
  [
    493,
    [
      "clean_content"
    ],
    "<p>What the hell is Detox?",
    "<p><strong>What the hell is Detox?</strong>"
  ],
  [
    664,
    [
      "clean_content"
    ],
    "<p>So who is Kill Edward?",
    "<p><strong>So who is Kill Edward?</strong>"
  ]
]

# Additional verified source-text restorations and minor copyedits.
REPLACEMENTS.extend([
  [
    168,
    [
      "content",
      "clean_content"
    ],
    "I even tried to use my real name.\" I've been",
    "I even tried to use my real name. I've been"
  ],
  [
    199,
    [
      "content",
      "clean_content"
    ],
    "It was crazy to how the crowd would react",
    "It was crazy how the crowd would react"
  ],
  [
    182,
    [
      "content"
    ],
    "McMahon.\n\nWe linked with P",
    "McMahon. We linked with P"
  ],
  [
    182,
    [
      "clean_content"
    ],
    "McMahon.</p><p>We linked with P",
    "McMahon. We linked with P"
  ],
  [
    221,
    [
      "content",
      "clean_content"
    ],
    "That was normal for.\"",
    "That was normal for [the officer].\""
  ],
  [
    221,
    [
      "content"
    ],
    "project.\"theme vastly",
    "project.\" Another theme vastly"
  ],
  [
    221,
    [
      "clean_content"
    ],
    "project. A theme vastly",
    "project. Another theme vastly"
  ],
  [
    439,
    [
      "content"
    ],
    "sweeping criminal justice. TMZ",
    "sweeping criminal justice reform. TMZ"
  ],
  [
    439,
    [
      "content"
    ],
    "who said the bill not had passed",
    "who said the bill would not have passed"
  ],
  [
    793,
    [
      "content",
      "clean_content"
    ],
    "Does it mean to you to be this ambassador",
    "What does it mean to you to be this ambassador"
  ],
  [
    185,
    [
      "content"
    ],
    "Steam Billy Danze's The Baker's Dozen",
    "Stream Billy Danze's The Baker's Dozen"
  ],
  [
    291,
    [
      "content"
    ],
    "reason for the spilt as",
    "reason for the split as"
  ],
  [
    357,
    [
      "content"
    ],
    "convince current both fans and his new widening audience",
    "convince both current fans and his growing audience"
  ],
  [
    497,
    [
      "content"
    ],
    "his critically-acclaimed album",
    "his critically acclaimed album"
  ]
])

def run():
    source = FILE.read_text(encoding="utf-8")
    posts = json.loads(source)
    if len(posts) != 858:
        raise ValueError(f"Expected 858 articles, found {len(posts)}")
    metadata = [(p["post_name"], p["date"], p["raw_content"]) for p in posts]
    changed = set()
    field_edits = 0
    for idx, p in enumerate(posts):
        for field in ("content", "clean_content"):
            old = p[field]
            text = re.sub(r' ?Type="(?:standard|any)"\]', "", old)
            if field == "clean_content":
                text = re.sub(r"(?:<strong>){2,}", "<strong>", text)
                text = re.sub(r"(?:</strong>){2,}", "</strong>", text)
            if field == "content":
                text = re.sub(r'\s*(?:REPEAT MEFAN FEEDBACK|Repeat MeFan Feedback)$', "", text)
            else:
                text = re.sub(r' Repeat MeFan Feedback(?=</p>$)', "", text)
            if text != old:
                p[field] = text
                changed.add(idx)
                field_edits += 1

    for idx, fields, before, after in REPLACEMENTS:
        for field in fields:
            text = posts[idx][field]
            if before in text:
                if text.count(before) != 1:
                    raise ValueError(f"Unexpected duplicate at {idx}:{field}")
                posts[idx][field] = text.replace(before, after, 1)
                changed.add(idx)
                field_edits += 1
            elif after not in text:
                raise ValueError(f"Expected text not found at {idx}:{field}: {before[:90]!r}")

    if metadata != [(p["post_name"], p["date"], p["raw_content"]) for p in posts]:
        raise ValueError("Unexpected modification to archive metadata")
    updated = json.dumps(posts, ensure_ascii=False, indent=2)
    assert len(json.loads(updated)) == 858
    if updated == source:
        print("No changes needed.")
        return
    FILE.write_text(updated, encoding="utf-8")
    print(f"Validated: 858 records; {len(changed)} articles touched; {field_edits} field edits.")

if __name__ == "__main__":
    run()
