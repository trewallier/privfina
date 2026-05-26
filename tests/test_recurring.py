from datetime import date
from decimal import Decimal
import unittest

from finance_engine.models import CashFlowCategory, CashFlowDirection
from finance_engine.recurring import (
    generate_monthly_recurring_cash_flows,
    generate_salary_cash_flows,
    generate_subscription_cash_flows,
)
from finance_engine.summary import aggregate_cash_flows_by_month


class RecurringCashFlowTests(unittest.TestCase):
    def test_salary_generation_creates_monthly_inflows(self) -> None:
        cash_flows = generate_salary_cash_flows(
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
            amount=Decimal("4200.00"),
            payment_day=25,
        )

        self.assertEqual([cash_flow.flow_date for cash_flow in cash_flows], [
            date(2026, 1, 25),
            date(2026, 2, 25),
            date(2026, 3, 25),
        ])
        self.assertTrue(all(cash_flow.direction is CashFlowDirection.INFLOW for cash_flow in cash_flows))
        self.assertTrue(all(cash_flow.category is CashFlowCategory.SALARY for cash_flow in cash_flows))

    def test_generation_skips_occurrences_before_start_date(self) -> None:
        cash_flows = generate_monthly_recurring_cash_flows(
            start_date=date(2026, 1, 15),
            end_date=date(2026, 3, 31),
            amount=Decimal("100.00"),
            payment_day=10,
            direction=CashFlowDirection.OUTFLOW,
            category=CashFlowCategory.OTHER,
            description="Test",
        )

        self.assertEqual([cash_flow.flow_date for cash_flow in cash_flows], [
            date(2026, 2, 10),
            date(2026, 3, 10),
        ])

    def test_payment_day_rolls_to_last_day_of_short_months(self) -> None:
        cash_flows = generate_subscription_cash_flows(
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
            amount=Decimal("15.00"),
            payment_day=31,
            description="Gym membership",
        )

        self.assertEqual([cash_flow.flow_date for cash_flow in cash_flows], [
            date(2026, 1, 31),
            date(2026, 2, 28),
            date(2026, 3, 31),
        ])
        self.assertTrue(all(cash_flow.direction is CashFlowDirection.OUTFLOW for cash_flow in cash_flows))
        self.assertTrue(all(cash_flow.category is CashFlowCategory.SUBSCRIPTION for cash_flow in cash_flows))

    def test_generated_recurring_cash_flows_integrate_with_monthly_summary(self) -> None:
        cash_flows = generate_salary_cash_flows(
            start_date=date(2026, 1, 1),
            end_date=date(2026, 2, 28),
            amount=Decimal("3000.00"),
            payment_day=28,
        ) + generate_subscription_cash_flows(
            start_date=date(2026, 1, 1),
            end_date=date(2026, 2, 28),
            amount=Decimal("20.00"),
            payment_day=5,
            description="Streaming",
        )

        summaries = aggregate_cash_flows_by_month(cash_flows)

        self.assertEqual(len(summaries), 2)
        self.assertEqual(summaries[0].inflow_total, Decimal("3000.00"))
        self.assertEqual(summaries[0].outflow_total, Decimal("20.00"))
        self.assertEqual(summaries[0].net_total, Decimal("2980.00"))

    def test_invalid_payment_day_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            generate_salary_cash_flows(
                start_date=date(2026, 1, 1),
                end_date=date(2026, 3, 31),
                amount=Decimal("4200.00"),
                payment_day=0,
            )


if __name__ == "__main__":
    unittest.main()