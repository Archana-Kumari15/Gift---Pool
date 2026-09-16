# Reasoning

This project was designed around the organiser's actual pain points: the constant question of “how much do I still owe?”, “have we collected enough?”, and “who pays whom at the end?”

The solution starts with a simple fairness model: everyone contributes equally to the total budget, so each person has a target share. The app then compares each contributor’s current total against that share to derive a per-person balance. A positive balance means they have overpaid and are entitled to be reimbursed; a negative balance means they still owe money.

The second layer is settlement logic. Instead of asking the organiser to manually calculate transfers, the app reduces the balances to the smallest number of transactions. It matches debtors to creditors and produces the simplest payment chain so everyone ends at zero.

The twist was the messy import requirement. Real contribution records are rarely clean: names can repeat with case differences, the same person may appear multiple times, amounts may be written with rupee symbols or commas, and some rows are invalid. The app therefore includes a cleaning pass that:

- normalises names to a common format,
- merges duplicate contributions from the same person,
- parses inconsistent amount formats,
- rejects rows that are clearly invalid,
- reports what was imported, de-duplicated, merged, and rejected.

This makes the tool useful for real-world organiser workflows, not just a one-off gift calculation.
