from datetime import date
from decimal import Decimal
import unittest

from finance_engine.models import CashFlow, CashFlowCategory, CashFlowDirection
from finance_engine.summary import aggregate_cash_flows_by_month, format_monthly_summary


class CashFlowModelTests(unittest.TestCase):
    def test_outflow_uses_negative_signed_amount(self) -> None:
        cash_flow = CashFlow(
            flow_date=date(2026, 5, 3),
            amount=Decimal("19.99"),
            direction=CashFlowDirection.OUTFLOW,
            category=CashFlowCategory.SUBSCRIPTION,
            description="Music streaming",
        )

        self.assertEqual(cash_flow.signed_amount, Decimal("-19.99"))

    def test_negative_amount_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            CashFlow(
                flow_date=date(2026, 5, 3),
                amount=Decimal("-1.00"),
                direction=CashFlowDirection.OUTFLOW,
                category=CashFlowCategory.OTHER,
            )


class MonthlySummaryTests(unittest.TestCase):
    def test_aggregate_cash_flows_by_month_groups_and_sorts(self) -> None:
        cash_flows = [
            CashFlow(
                flow_date=date(2026, 6, 1),
                amount=Decimal("3500.00"),
                direction=CashFlowDirection.INFLOW,
                category=CashFlowCategory.SALARY,
                description="June salary",
            ),
            CashFlow(
                flow_date=date(2026, 5, 5),
                amount=Decimal("12.99"),
                direction=CashFlowDirection.OUTFLOW,
                category=CashFlowCategory.SUBSCRIPTION,
                description="Video streaming",
            ),
            CashFlow(
                flow_date=date(2026, 5, 28),
                amount=Decimal("3500.00"),
                direction=CashFlowDirection.INFLOW,
                category=CashFlowCategory.SALARY,
                description="May salary",
            ),
        ]

        summaries = aggregate_cash_flows_by_month(cash_flows)

        self.assertEqual(len(summaries), 2)
        self.assertEqual(summaries[0].month, date(2026, 5, 1))
        self.assertEqual(summaries[0].inflow_total, Decimal("3500.00"))
        self.assertEqual(summaries[0].outflow_total, Decimal("12.99"))
        self.assertEqual(summaries[0].net_total, Decimal("3487.01"))
        self.assertEqual(summaries[0].transaction_count, 2)
        self.assertEqual(summaries[1].month, date(2026, 6, 1))

    def test_format_monthly_summary_returns_plain_text_table(self) -> None:
        summaries = aggregate_cash_flows_by_month(
            [
                CashFlow(
                    flow_date=date(2026, 5, 28),
                    amount=Decimal("3500.00"),
                    direction=CashFlowDirection.INFLOW,
                    category=CashFlowCategory.SALARY,
                    description="May salary",
                )
            ]
        )

        rendered = format_monthly_summary(summaries)

        self.assertIn("month | inflow | outflow | net | count", rendered)
        self.assertIn("2026-05 | 3500.00 | 0 | 3500.00 | 1", rendered)


if __name__ == "__main__":
    unittest.main()