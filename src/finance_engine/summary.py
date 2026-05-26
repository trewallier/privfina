from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Iterable

from .models import CashFlow, CashFlowDirection


@dataclass(frozen=True)
class MonthlySummary:
    month: date
    inflow_total: Decimal
    outflow_total: Decimal
    net_total: Decimal
    transaction_count: int


def aggregate_cash_flows_by_month(cash_flows: Iterable[CashFlow]) -> list[MonthlySummary]:
    grouped: dict[date, dict[str, Decimal | int]] = defaultdict(
        lambda: {
            "inflow_total": Decimal("0"),
            "outflow_total": Decimal("0"),
            "transaction_count": 0,
        }
    )

    for cash_flow in cash_flows:
        month_start = date(cash_flow.flow_date.year, cash_flow.flow_date.month, 1)
        bucket = grouped[month_start]
        if cash_flow.direction is CashFlowDirection.INFLOW:
            bucket["inflow_total"] += cash_flow.amount
        else:
            bucket["outflow_total"] += cash_flow.amount
        bucket["transaction_count"] += 1

    summaries: list[MonthlySummary] = []
    for month_start in sorted(grouped):
        bucket = grouped[month_start]
        inflow_total = bucket["inflow_total"]
        outflow_total = bucket["outflow_total"]
        summaries.append(
            MonthlySummary(
                month=month_start,
                inflow_total=inflow_total,
                outflow_total=outflow_total,
                net_total=inflow_total - outflow_total,
                transaction_count=bucket["transaction_count"],
            )
        )

    return summaries


def format_monthly_summary(summaries: Iterable[MonthlySummary]) -> str:
    lines = ["month | inflow | outflow | net | count"]
    for summary in summaries:
        lines.append(
            " | ".join(
                [
                    summary.month.strftime("%Y-%m"),
                    f"{summary.inflow_total}",
                    f"{summary.outflow_total}",
                    f"{summary.net_total}",
                    str(summary.transaction_count),
                ]
            )
        )
    return "\n".join(lines)