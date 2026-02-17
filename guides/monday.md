# Monday.com Board Guide

How to manage the **Chillist MVP – Features** board via the Monday.com API.

---

## Board Info

- **Board ID:** `5091872069`
- **View:** `43711321`
- **URL:** `monday.com/boards/5091872069/views/43711321`

## Authentication

The Monday API token is stored in `chillist-be/.env` as `MONDAY_API_TOKEN`. All API calls use:

```bash
source .env
curl -s -X POST https://api.monday.com/v2 \
  -H "Authorization: $MONDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "<GRAPHQL_QUERY>"}'
```

## Board Structure

### Groups

| Group ID | Name |
|----------|------|
| `group_mm0mjvfd` | Done |
| `group_mm0mbd3b` | In Progress |
| `topics` | Backlog |

### Columns

| Column ID | Name | Type | Values |
|-----------|------|------|--------|
| `name` | Name | name | (item title) |
| `color_mm0mk214` | Feature Status | status | `Not Started`, `In Progress`, `Done`, `Blocked` |
| `color_mm0m9xdr` | Feature | status | `Users&Access`, `Participant onborading` |
| `color_mm0m8zyq` | Repo | status | `BE`, `FE`, `Both` |
| `color_mm0mfst7` | Priority | status | (check board settings) |
| `text_mm0mveg3` | GitHub Issue Link | text | URL string |
| `multiple_person_mm0mfxxs` | Assignees | people | (user IDs) |
| `dropdown_mm0mte12` | Release Version | dropdown | (check board settings) |
| `dropdown_mm0m2ym3` | Feature Type | dropdown | (check board settings) |
| `numeric_mm0mw4d` | Estimated Effort | numbers | numeric value |
| `timerange_mm0mh12y` | Timeline | timeline | date range |

## Common Operations

### Create an item

```bash
source .env
curl -s -X POST https://api.monday.com/v2 \
  -H "Authorization: $MONDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { create_item(board_id: 5091872069, group_id: \"topics\", item_name: \"My New Task\", column_values: \"{\\\"color_mm0m9xdr\\\": {\\\"label\\\": \\\"Users&Access\\\"}, \\\"color_mm0mk214\\\": {\\\"label\\\": \\\"Not Started\\\"}, \\\"color_mm0m8zyq\\\": {\\\"label\\\": \\\"BE\\\"}, \\\"text_mm0mveg3\\\": \\\"https://github.com/Alexgub84/chillist-be/issues/XX\\\"}\") { id } }"}'
```

Replace `group_id` with the target group, and adjust column values as needed.

### Update an item status

```bash
source .env
curl -s -X POST https://api.monday.com/v2 \
  -H "Authorization: $MONDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { change_simple_column_value(board_id: 5091872069, item_id: ITEM_ID, column_id: \"color_mm0mk214\", value: \"In Progress\") { id } }"}'
```

Valid Feature Status values: `Not Started`, `In Progress`, `Done`, `Blocked`

### Move an item to a different group

```bash
source .env
curl -s -X POST https://api.monday.com/v2 \
  -H "Authorization: $MONDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { move_item_to_group(item_id: ITEM_ID, group_id: \"group_mm0mbd3b\") { id } }"}'
```

### List all items

```bash
source .env
curl -s -X POST https://api.monday.com/v2 \
  -H "Authorization: $MONDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ boards(ids: [5091872069]) { items_page(limit: 50) { items { id name group { title } } } } }"}' | python3 -m json.tool
```

### Get board structure (columns, groups)

```bash
source .env
curl -s -X POST https://api.monday.com/v2 \
  -H "Authorization: $MONDAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ boards(ids: [5091872069]) { name groups { id title } columns { id title type } } }"}' | python3 -m json.tool
```

## Conventions

- Every item must have a **GitHub Issue Link** pointing to the corresponding issue
- Every item must have a **Repo** tag (`BE`, `FE`, or `Both`)
- Every item must have a **Feature** tag to group related work
- When starting work on an item, move it to **In Progress** group and set Feature Status to `In Progress`
- When work is merged, move to **Done** group and set Feature Status to `Done`
