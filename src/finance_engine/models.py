from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum


class CashFlowDirection(str, Enum):
    INFLOW = "inflow"
    OUTFLOW = "outflow"


class CashFlowCategory(str, Enum):
    LOAN = "loan"
    INVESTMENT = "investment"
    SALARY = "salary"
    SUBSCRIPTION = "subscription"
    OTHER = "other"


@dataclass(frozen=True)
class CashFlow:
    flow_date: date
    amount: Decimal
    direction: CashFlowDirection
    category: CashFlowCategory
    description: str = ""

    def __post_init__(self) -> None:
        if self.amount < Decimal("0"):
            raise ValueError("Cash flow amount must be non-negative.")

    @property
    def signed_amount(self) -> Decimal:
        if self.direction is CashFlowDirection.INFLOW:
            return self.amount
        return -self.amount