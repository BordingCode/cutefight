// The Warden's quest line — accepted and turned in at the Warden's hut in the village.
// objective types: reach (campfire or zone) / catch (species, null = any) /
// seen (species spotted in the wild) / gate (guardian defeated or befriended).
// unlocks: gate id that becomes ready (its guardian appears) when the quest is turned in.
export const QUESTS = [
  {
    id: 'q1', title: 'Trail Legs',
    give: '“The storm eats another field each week. Start small: follow the meadow east and light the campfire out there. A lit fire is a promise you’ll come back.”',
    done: '“Good. The meadow feels less lonely already.”',
    objective: { type: 'reach', campfire: 'meadow' }, reward: { orbs: 3 },
  },
  {
    id: 'q2', title: 'A Gentle Hand',
    give: '“I catalogue monsters, yet I fear them. You befriend them. Show me it can be done — daze one gently and catch it.”',
    done: '“Remarkable. Not a scratch on it. Odd world.”',
    objective: { type: 'catch', species: null }, reward: { orbs: 3 },
  },
  {
    id: 'q3', title: 'The Windborne',
    give: '“Gustlings ride the storm’s edge — their calm answers questions mine can’t. Bring one to me, and I’ll show you the way across the old bridge.”',
    done: '“Feel that? It isn’t afraid of the storm. Curious… The bridge guardian has woken — deal with it and the forest is yours.”',
    objective: { type: 'catch', species: 'gustling' }, reward: { orbs: 4 }, unlocks: 'bridge',
  },
  {
    id: 'q4', title: 'The Bridge Guardian',
    give: '“The Bramble Warden guards the crossing at the meadow’s far end. Defeat it — or better, befriend it. Either way, the path opens.”',
    done: '“The bridge is open. The pines whisper your name now.”',
    objective: { type: 'gate', gate: 'bridge' }, reward: { orbs: 4 },
  },
  {
    id: 'q5', title: 'Echoes in the Pines',
    give: '“Something glows deep in Pinewhisper — a mushroom that dreams. Find it. See it with your own eyes; catalogue it — or befriend it.”',
    done: '“A Mycelisk! Alive! Then the old stories are true… and the mountain pass will need opening. Its guardian stirs.”',
    objective: { type: 'seen', species: 'mycelisk' }, reward: { orbs: 5 }, unlocks: 'pass',
  },
  {
    id: 'q6', title: 'The Mountain Pass',
    give: '“The Storm Alpha holds the pass into the high snow. It answers kiting with lightning — stay close, stay brave.”',
    done: '“The pass is open. From here the world turns white and quiet.”',
    objective: { type: 'gate', gate: 'pass' }, reward: { orbs: 6 },
  },
  {
    id: 'q7', title: 'Eye of the Storm',
    give: '“Whatever waits on the Summit… it is not angry. It is frightened. Cross the Frostpeak Slopes and climb. Go gently, friend.”',
    done: '“You went. That was the whole of it, all along.”',
    objective: { type: 'reach', zone: 'summit' }, reward: { orbs: 6 },
  },
];

export const QUEST_EPILOGUE = '“The valley owes you a debt it can’t count. Fill the Sanctuary, if you like — every friend caught and grown is one more the storm can’t frighten.”';
