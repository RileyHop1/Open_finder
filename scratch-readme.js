const fs = require('fs');
const p = 'apps/client/README.md';
let s = fs.readFileSync(p, 'utf8');
const entry = [
  '- **Conditions** (`components/sheet/ConditionsPanel.vue`) -- each condition named in',
  '  words with its value ("Frightened 2"), so nothing relies on colour or an icon',
  '  alone. An owner or the GM can add one (the ordinary way: a second source of a',
  '  valued condition keeps the higher value, never the sum), set a valued condition',
  '  to an exact value (the manual override; 0 removes it), or remove it. Names to',
  '  pick from are the imported condition definitions; with none imported yet it',
  '  falls back to typing a name, as the server accepts any well-formed one until',
  '  definitions exist (`docs/conditions.md`). Not optimistic: the merge and the',
  '  clearing of superseded conditions are server logic, so the change appears when',
  '  the broadcast returns, and the sheet\'s numbers move with it. **Built.**',
  '- **The canvas** —',
].join('\n');
s = s.replace('- **The canvas** —', entry);
fs.writeFileSync(p, s);
