# Threat intelligence in: the STIX import

*Export / Import → Import data…* recognises a STIX 2.1 bundle - chosen as a file or pasted -
and, instead of the diff, opens a column browser: from any object to a set of records for
the open study. Nothing is written until the same additive review every import goes
through. The sample bundle `samples/stix-story.json` (74 objects, invented, strictly valid
against the OASIS 2.1 schemas) is there to try it on.

## What reads

Any STIX 2.1 bundle: the MITRE ATT&CK Enterprise bundle, a MISP or TAXII export, a vendor
report, an Attack Flow. The reader knows STIX core - objects by type, relationships in
both directions, embedded references (`object_refs`, `effect_refs`), the ATT&CK id where
an object carries one - and nothing vendor-specific. A type the study has no place for is
listed with its count and the words *not mapped*, with the reason on hover; it is never
dropped silently. Revoked and deprecated objects are set aside and counted.

## Columns, and three steps

The dialog browses the bundle **in columns, as a file browser does**. The first column
lists the bundle's types with their counts and what each becomes (coloured for the
workshop it lands in, grey where it becomes nothing); the bundle's facts stand above -
the period it covers, the sectors it names, its author and marking. Three rules, and
nothing else:

1. **A row pressed opens the next column** with what the row holds. A type's row: its
   objects, cut into groups where there are too many to list (techniques by tactic,
   everything else by leading letters). An object's row: its card, then its relations as
   headed groups - *uses → attack-pattern 7*, *← attributed-to campaign 1* - with the
   objects under each. The pressed row stays marked, so the columns are the path.
2. **The box chooses.** It stands only on rows that become a record, and on a
   relation's heading, where it takes the whole group. Opening and choosing are two
   places on the row.
3. **A row further left leads back**: everything to its right goes; the choice stays.

Every column has a search where it holds more than a dozen rows, and a group shows a
dozen rows before *… n more*. The first column's search runs across the whole bundle -
names, ATT&CK ids, aliases, sectors, tactics, description text - grouped by type, an id or
a name that starts with the query first; a hit opens straight to its object. A relation
runs both ways, so an object already open in a column further left is not opened again:
its row says *◂ open in column n* and leads there. A column with nothing to choose says so.
The tray at the foot appears as things are chosen: the chips (press one to open it, × to
leave it out), what they become, and only the workshops that gain something.

On the landing, **What the bundle connects** draws the chosen objects by the relationships
the bundle records between them - one row per connected group, actors and campaigns
first, steps in tactic order, the relations as named arcs - and marks an object the
bundle connects to nothing else chosen as *disjoint*. That is the check before importing
a selection as if it belonged together.

**Landing** is the second step, on the whole width: the workshops with what each gains
beside what is there, the chain the chosen steps make drawn as tactic lanes (press a step
to leave it out), what the records **touch** in the study, and the records themselves,
every field editable. A touch by name offers *create beside it* (the default: a name in
common is a suggestion, not proof) or *update the existing record*; a step whose
technique is already in a chain, or a measure naming a mitigation an existing measure
names, is noted and both are kept. **Review** is the third step, the additive review
every import goes through.

## Where to start

Any object will do as a start -

- an **actor** (`intrusion-set`, `threat-actor`) leads to the techniques it `uses`, the
  campaigns `attributed-to` it, the software, the sectors it `targets`;
- a **technique** to the actors, campaigns and malware that use it, and the mitigations
  that act on it;
- a **sector** (an `identity` with `sectors`) to the actors that target it - which needs
  a bundle that carries `targets` relationships; ATT&CK alone carries few;
- a **campaign** to its actor and its techniques; a **mitigation** to the techniques it
  answers to.

An object that becomes nothing by itself - an indicator has malware and infrastructure on
every side - still opens; its column puts the groups that become something first, and
says when there is nothing to choose in it.

## What it becomes

A rule per STIX type says which entity type an object becomes and where each field's
value comes from (`src/profile/ebios/stix.ts`):

| STIX | becomes | notes |
|---|---|---|
| `threat-actor`, `intrusion-set` | risk source | category from `threat_actor_types`, capability from `sophistication`, resources from `resource_level` - the STIX open vocabularies read onto the scales; aliases, goals and the ATT&CK id into the description |
| `attack-pattern` | kill-chain step | under its first tactic; the technique read through to what ATT&CK calls it now when the feed names a revoked one; a feed's own technique without an ATT&CK id is kept by name |
| `campaign` | operational scenario | the shell; its steps are the techniques chosen with it, in tactic order |
| `course-of-action` | security measure | preventive, recommended, carrying its `M####` so the technique-fit checks read it |
| `malware`, `tool`, `indicator`, `identity`, `report`, `sighting`, … | not mapped | named in the dialog with why |

Every field the rule could not fill is a marked gap - *sophistication not given*, *choose
the scenario these steps belong to* - and every field is editable before the review. A
selection of techniques does not become a chain by itself: steps attach to the scenario
you choose (an existing one, or the campaign in the selection) and take the tactic order as
a proposal; which of them an attacker walks, and in what order, is yours to decide.

## Repeating an import

A record's id is a function of the STIX object's id. Importing the same object again -
from a newer bundle, or after adjusting it differently - is a change to the record it
wrote before, shown as such in the review, never a second record. Each record carries
`stix:<object id>` as its source.

## Checks

Two checks on the kill chain follow ATT&CK's own lifecycle: a step under a tactic ATT&CK
has retired (v19 split Defense Evasion into Stealth and Defense Impairment), and a step
under a technique ATT&CK has replaced. Both name the successor; neither rewrites the step.
