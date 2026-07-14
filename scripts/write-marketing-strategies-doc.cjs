const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'docs', 'aqond-os', 'products', 'brain', 'MARKETING_STRATEGIES.md');
fs.mkdirSync(path.dirname(target), { recursive: true });

const content = `# Marketing Strategies — AI Director Script Strategy Catalog

> **Canonical reference** for the Script Strategy Engine.
> Runtime data: \`backend/lib/aivos/merchant-ad/director/data/marketing-strategies.json\`
> Manifest: \`marketing-strategies.manifest.json\`

The AI Director does **not** embed strategy logic in code. Strategies are selected from this catalog based on **business type**, **industry**, and **campaign context**, then passed to the Psychology Engine and Script Composer.

---

## Strategy Library

| ID | Thai | English | Emotional angle |
|----|------|---------|-----------------|
| \`sell_time\` | ขายเวลา | Sell time | Save time, simplify life, convenient now |
| \`sell_freedom\` | ขายอิสระ | Sell freedom | Freedom from hassle, flexible lifestyle |
| \`sell_confidence\` | ขายความมั่นใจ | Sell confidence | Feel confident, capable, ready to shine |
| \`sell_hope\` | ขายความหวัง | Sell hope | Better future, positive transformation |
| \`sell_beauty\` | ขายความสวย | Sell beauty | Look and feel beautiful effortlessly |
| \`sell_health\` | ขายสุขภาพ | Sell health | Healthy body and mind, feel your best |
| \`sell_luxury\` | ขายความหรูหรา | Sell luxury | Premium quality, exclusive refined experience |
| \`sell_acceptance\` | ขายการยอมรับ | Sell acceptance | Be accepted, fit in, social proof |
| \`sell_memory\` | ขายความทรงจำ | Sell memory | Nostalgic taste, familiar warmth, memorable moments |
| \`sell_happiness\` | ขายความสุข | Sell happiness | Joy, delight, everyday happiness |
| \`sell_value\` | ขายความคุ้ม | Sell value | Great deal, smart purchase, worth every baht |

---

## How strategies are used

\`\`\`
Business Context (industry, type, audience)
        ↓
Strategy Engine  ← reads marketing-strategies.json + business-strategy-map.json
        ↓
Psychology Engine (emotion layer)
        ↓
Script Composer (hook → pain → solution → offer → CTA)
        ↓
Prompt Composition Engine (dimensions + provider wrapper)
\`\`\`

### Industry → strategy mapping (examples)

| Industry | Primary | Secondary |
|----------|---------|-----------|
| Food / Restaurant | \`sell_memory\` | \`sell_happiness\` |
| Beauty / Skincare | \`sell_confidence\` | \`sell_beauty\` |
| Marketplace | \`sell_time\` | \`sell_value\` |
| Healthcare | \`sell_health\` | \`sell_confidence\` |
| Real estate | \`sell_hope\` | \`sell_luxury\` |
| Recruitment | \`sell_hope\` | \`sell_freedom\` |

Mappings live in \`business-strategy-map.json\` — update there, not in engine code.

---

## Adding a new strategy

1. Add entry to \`marketing-strategies.json\` with \`label_th\`, \`label_en\`, \`emotion_id\`, \`angle\`
2. Document it in this file
3. Wire industry/business mapping in \`business-strategy-map.json\`
4. Run \`node --test __tests__/aivosMerchantAdScriptEngine.test.js\`

---

## Related docs

- [AI Director overview](./AI_DIRECTOR.md)
- [Prompt Composition Engine](./PROMPT_ENGINE.md)
- [Script Strategy Engine](./SCRIPT_ENGINE.md)
`;

fs.writeFileSync(target, content, 'utf8');
console.log('write-marketing-strategies-doc: complete ->', target);
