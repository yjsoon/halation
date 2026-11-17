# VR-04: Duplicate for today no longer drops a transfer's category

- Base: this round's branch after VR-02; disposable local stack, synthetic data only.
- Fixture: 2026-11-13 Everyday -23.00 transfer to Home Equity Tracker (Tracking), category Groceries, memo "review tracked transfer". API read-back: `category_id cat-groceries`, `transfer_account_id` = the tracker.
- Why not copy it: the web gives no transfer a category. The add row and the row editor show "Transfer" in the category cell, and Quick entry's Transfer has no category, so any copy would save without the category.
- Result, Everyday register, row editor opened with Enter:
  - Categorised transfer to the tracker: no Duplicate for today at 1440 or 390.
  - Ordinary spend (Activity Test Employer): offered at 1440 and 390.
  - Uncategorised transfer to Rainy Day Saver: offered at 1440 and 390.
