from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal

from .models import CashFlow, CashFlowCategory, CashFlowDirection


def generate_monthly_recurring_cash_flows(
    *,
    start_date: date,
    end_date: date,
    amount: Decimal,
    payment_day: int,
    direction: CashFlowDirection,
    category: CashFlowCategory,
    description: str = "",
) -> list[CashFlow]:
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date.")
    if amount < Decimal("0"):
        raise ValueError("Recurring cash flow amount must be non-negative.")
    if payment_day < 1 or payment_day > 31:
        raise ValueError("payment_day must be between 1 and 31.")

    cash_flows: list[CashFlow] = []
    current_year = start_date.year
    current_month = start_date.month

    while True:
        flow_date = _resolve_payment_date(current_year, current_month, payment_day)
        if flow_date >= start_date:
            if flow_date > end_date:
                break
            cash_flows.append(
                CashFlow(
                    flow_date=flow_date,
                    amount=amount,
                    direction=direction,
                    category=category,
                    description=description,
                )
            )

        if current_year == end_date.year and current_month == end_date.month:
            break

        current_year, current_month = _next_month(current_year, current_month)

    return cash_flows


def generate_salary_cash_flows(
    *,
    start_date: date,
    end_date: date,
    amount: Decimal,
    payment_day: int,
    description: str = "Salary",
) -> list[CashFlow]:
    return generate_monthly_recurring_cash_flows(
        start_date=start_date,
        end_date=end_date,
        amount=amount,
        payment_day=payment_day,
        direction=CashFlowDirection.INFLOW,
        category=CashFlowCategory.SALARY,
        description=description,
    )


def generate_subscription_cash_flows(
    *,
    start_date: date,
    end_date: date,
    amount: Decimal,
    payment_day: int,
    description: str,
) -> list[CashFlow]:
    return generate_monthly_recurring_cash_flows(
        start_date=start_date,
        end_date=end_date,
        amount=amount,
        payment_day=payment_day,
        direction=CashFlowDirection.OUTFLOW,
        category=CashFlowCategory.SUBSCRIPTION,
        description=description,
    )


def _resolve_payment_date(year: int, month: int, payment_day: int) -> date:
    last_day_of_month = monthrange(year, month)[1]
    day = min(payment_day, last_day_of_month)
    return date(year, month, day)


def _next_month(year: int, month: int) -> tuple[int, int]:
    if month == 12:
        return year + 1, 1
    return year, month + 1