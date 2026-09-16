#!/usr/bin/env python3
"""Fair pool tracker for shared expenses.

The organiser can enter a pool total, the participants, and what each person has paid.
It then explains:
- each person's equal share,
- their current balance (paid minus share),
- how much is still left to collect,
- the minimal transfer list to settle everyone up.
"""

from __future__ import annotations

import argparse
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Dict, List, Tuple


def money(value: object) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def parse_name_amounts(raw: str | None) -> Dict[str, Decimal]:
    if raw is None:
        return {}
    records: Dict[str, Decimal] = {}
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        if ":" not in item:
            raise ValueError(f"Invalid payment entry '{item}'. Use name:amount.")
        name, amount = [part.strip() for part in item.split(":", 1)]
        if not name:
            raise ValueError(f"Payment item '{item}' has an empty name.")
        records[name] = money(amount)
    return records


def build_pool(total_budget: Decimal, people: List[str], payments: Dict[str, Decimal]) -> Dict[str, object]:
    people = [name.strip() for name in people if name.strip()]
    if not people:
        raise ValueError("At least one participant is required.")

    normalized: Dict[str, Decimal] = {}
    for person in people:
        normalized[person] = payments.get(person, Decimal("0.00"))

    share = (total_budget / Decimal(len(people))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    balances = {person: normalized[person] - share for person in people}

    total_collected = sum(normalized.values(), Decimal("0.00"))
    still_needed = (total_budget - total_collected).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if still_needed < 0:
        still_needed = Decimal("0.00")

    return {
        "people": people,
        "share": share,
        "payments": normalized,
        "balances": balances,
        "total_budget": total_budget,
        "total_collected": total_collected,
        "still_needed": still_needed,
    }


def settlement_plan(balances: Dict[str, Decimal]) -> List[Tuple[str, str, Decimal]]:
    debtors = {name: -amount for name, amount in balances.items() if amount < 0}
    creditors = {name: amount for name, amount in balances.items() if amount > 0}

    plan: List[Tuple[str, str, Decimal]] = []
    while debtors and creditors:
        debtor_name, debtor_amount = min(debtors.items(), key=lambda item: item[1])
        creditor_name, creditor_amount = max(creditors.items(), key=lambda item: item[1])

        amount = min(-debtor_amount, creditor_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if amount <= Decimal("0.00"):
            break

        plan.append((debtor_name, creditor_name, amount))

        debtors[debtor_name] = debtor_amount + amount
        creditors[creditor_name] = creditor_amount - amount

        if abs(debtors[debtor_name]) <= Decimal("0.01"):
            del debtors[debtor_name]
        if creditors[creditor_name] <= Decimal("0.01"):
            del creditors[creditor_name]

    return plan


def format_money(value: Decimal) -> str:
    return f"₹{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):,.2f}"


def describe_pool(data: Dict[str, object]) -> str:
    people = data["people"]
    share = data["share"]
    payments = data["payments"]
    balances = data["balances"]
    total_budget = data["total_budget"]
    total_collected = data["total_collected"]
    still_needed = data["still_needed"]

    lines: List[str] = []
    lines.append("Fair Pool Tracker")
    lines.append("=" * 24)
    lines.append(f"Total budget: {format_money(total_budget)}")
    lines.append(f"Equal share per person: {format_money(share)}")
    lines.append(f"Total collected: {format_money(total_collected)}")
    lines.append(f"Still to collect: {format_money(still_needed)}")
    lines.append("")
    lines.append("Per-person summary:")
    for person in people:
        balance = balances[person]
        status = "overpaid" if balance > 0 else "owes" if balance < 0 else "settled"
        lines.append(f"- {person}: paid {format_money(payments[person])}, balance {format_money(balance)} ({status})")

    lines.append("")
    settlement = settlement_plan(balances)
    if settlement:
        lines.append("Minimal settlement list:")
        for debtor, creditor, amount in settlement:
            lines.append(f"- {debtor} should pay {creditor} {format_money(amount)}")
    else:
        lines.append("No transfers are needed; everyone is settled under the current amounts.")

    return "\n".join(lines)


def load_json_file(path: str) -> Dict[str, object]:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if "total_budget" not in payload or "people" not in payload:
        raise ValueError("JSON must include 'total_budget' and 'people'.")

    people = list(payload["people"])
    total_budget = money(payload["total_budget"])
    payments = {}
    for entry in people:
        if not isinstance(entry, dict):
            raise ValueError("Each item in 'people' must be an object with a 'name' and 'paid' value.")
        name = str(entry.get("name", "")).strip()
        if not name:
            raise ValueError("Each person in the pool requires a non-empty name.")
        payments[name] = money(entry.get("paid", 0))

    return {"total_budget": total_budget, "people": list(payments.keys()), "payments": payments}


def run_from_args(args: argparse.Namespace) -> str:
    if args.file:
        payload = load_json_file(args.file)
        total_budget = payload["total_budget"]
        people = payload["people"]
        payments = payload["payments"]
    else:
        if args.budget is None:
            people = ["Asha", "Ravi", "Meera", "Ishaan", "Neha", "Karan", "Pooja", "Sahil"]
            payments = {
                "Asha": Decimal("900.00"),
                "Ravi": Decimal("750.00"),
                "Meera": Decimal("600.00"),
                "Ishaan": Decimal("750.00"),
                "Neha": Decimal("1000.00"),
                "Karan": Decimal("825.00"),
                "Pooja": Decimal("750.00"),
                "Sahil": Decimal("425.00"),
            }
            total_budget = Decimal("6000.00")
        else:
            total_budget = money(args.budget)
            people = [person.strip() for person in args.people.split(",") if person.strip()]
            if not people:
                raise ValueError("Provide at least one name using --people.")
            payments = parse_name_amounts(args.paid)
            for person in people:
                payments.setdefault(person, Decimal("0.00"))

    data = build_pool(total_budget, people, payments)
    return describe_pool(data)


def main() -> None:
    parser = argparse.ArgumentParser(description="Track a shared gift pool and settle balances fairly.")
    parser.add_argument("--budget", help="Total pool budget, e.g. 6000")
    parser.add_argument("--people", help="Comma-separated names, e.g. Asha,Ravi,Meera")
    parser.add_argument("--paid", help="Comma-separated payments as name:amount, e.g. Asha:900,Ravi:750")
    parser.add_argument("--file", help="Path to a JSON file containing the pool data")
    args = parser.parse_args()

    try:
        print(run_from_args(args))
    except Exception as exc:  # noqa: BLE001 - CLI-friendly failure path
        raise SystemExit(f"Error: {exc}") from exc


if __name__ == "__main__":
    main()
