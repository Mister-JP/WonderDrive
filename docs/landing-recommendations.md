# Landing recommendation replenishment runbook

Landing recommendations are permanent, global editorial records in D1. The public API returns **20 records per request**. It does not load the complete catalog and paginate it in the browser.

Ordering is a stack:

1. newest published batch first;
2. cards within that batch in editorial `position` order;
3. older batches afterward;
4. SQL `LIMIT 20 OFFSET …` produces pages 1, 2, 3, and so on.

Publishing never expires, replaces, or edits an older batch. Adding 20 cards creates a completely new page 1 and shifts every older card down by one page. A smaller batch still starts at the top and shifts page boundaries by that many cards.

## Replenishment checklist

### 1. Audit the live catalog

Read every existing API page before researching. Record the ids, questions, categories, sources, and obvious visual motifs so the new run does not repeat them.

```sh
curl -sS 'http://localhost:3000/api/landing-recommendations?page=1' | jq '.data | {page,pageSize,totalItems,totalPages,items}'
```

Continue through `totalPages`. This complete-catalog read is an editor-only audit; the public landing UI still requests only the page the visitor opens.

### 2. Research a coherent 20-card set

- Prefer questions that a curious beginner can understand immediately.
- Favor primary sources and responsible institutions: research papers, museums, archives, government science agencies, observatories, and the institution responsible for a site or object.
- Check the existing catalog for both exact duplicates and near-duplicate ideas.
- Balance the eight supported categories: `Nature`, `Science`, `History`, `Culture`, `Systems`, `Space`, `Technology`, and `Art`.
- Use concrete visual evidence rather than generic stock photography.
- Verify the teaser is supported by the linked source. Keep uncertainty explicit for unresolved subjects.
- Confirm image reuse terms and use an attribution/source link appropriate to the asset.

### 3. Prepare the batch file

Store reviewed batches under `editorial/landing/YYYY-MM-DD-short-title.json`. See [`2026-07-20-curiosity-across-scales.json`](../editorial/landing/2026-07-20-curiosity-across-scales.json) for a complete example.

Each card requires:

```json
{
  "id": "stable-unique-slug",
  "category": "Science",
  "question": "Why does this happen?",
  "teaser": "One concise, source-supported explanation.",
  "imageUrl": "https://example.org/image.jpg",
  "imageAlt": "A literal description of the visible image",
  "sourceLabel": "Source institution",
  "sourceUrl": "https://example.org/source",
  "size": "standard"
}
```

Allowed sizes are `wide`, `tall`, `standard`, and `compact`. A batch can contain 1–100 cards, although 20 is the standard replenishment size because it maps cleanly to one page.

### 4. Validate without writing

Run the helper against the same backend the site is using:

```sh
npm run landing:replenish -- editorial/landing/YYYY-MM-DD-short-title.json \
  --base-url http://localhost:3000 \
  --dry-run
```

The helper validates required fields, categories, sizes, URL syntax, unique ids and questions, image responses, and overlap with every already-published page.

Also open a representative sample of source and image links in a browser. Some institutions reject automated `HEAD` requests even when their pages work normally.

### 5. Back up and publish

Take a database backup appropriate to the target environment before publishing. Set the server-side `EDITOR_API_KEY`, then use the authenticated API through the same helper:

```sh
EDITOR_API_KEY='configured-secret' npm run landing:replenish -- \
  editorial/landing/YYYY-MM-DD-short-title.json \
  --base-url http://localhost:3000
```

Do not put the editor key in the JSON file, documentation, shell history, or source control. The endpoint validates the entire batch before its atomic D1 write.

### 6. Verify the stack and UI

For a standard 20-card replenishment, verify:

- page 1 contains exactly the 20 new ids in file order;
- the former first card is now the first card on page 2;
- every full page has 20 rows and only the last page may have fewer;
- `totalItems` increased by 20 and `totalPages` equals `ceil(totalItems / 20)`;
- page-number buttons request the selected page and update `aria-current`;
- category filtering applies only to the currently fetched page;
- images, alt text, source links, and Explore actions work.

```sh
for page_number in 1 2 3; do
  curl -sS "http://localhost:3000/api/landing-recommendations?page=$page_number" \
    | jq '{page:.data.page,totalItems:.data.totalItems,totalPages:.data.totalPages,count:(.data.items|length),ids:[.data.items[].id]}'
done
```

Run the focused repository test, typecheck, and production build before deployment.
