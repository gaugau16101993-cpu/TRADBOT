# MASTER IMPLEMENTATION PLAN & AUDIT REPORT: BITGET 5-BOT ENGINE V2

Kế hoạch nâng cấp và tối ưu hóa toàn diện hệ thống **BITGET FAST AUTO TRADING-ENGINE (MEO AI 5-BOT V2)** dựa trên kết quả kiểm toán pháp y độc lập từ bộ dữ liệu thực tế `bitget_5bot_complete_audit_2026-11-08.csv` (926 giao dịch hợp lệ).

---

## 1. User Review & Confirmed Critical Decisions

> [!IMPORTANT]
> Toàn bộ các tham số vận hành then chốt đã được thống nhất trực tiếp qua xác nhận của bạn:

- **Quyết định 1 (Xử lý chuỗi lệnh thua liên tiếp)**: Khi gặp chuỗi 3 lệnh thua liên tiếp, hệ thống **bắn cảnh báo rủi ro tức thì qua Log hệ thống và Telegram**, đồng thời ghi nhận vào telemetry của Risk Governor (không tự ý dừng hệ thống nếu chưa chạm ngưỡng giới hạn lỗ trong ngày).
- **Quyết định 2 (Giới hạn lỗ tối đa trong ngày - Daily Loss Limit)**: Áp dụng mức giới hạn lỗ nghiêm ngặt **5.0 USDT (tương đương 5% tổng vốn 100 USDT)** mỗi ngày. Nếu tổng lỗ ròng tích lũy chạm ngưỡng này, Circuit Breaker tự động kích hoạt khóa toàn bộ lệnh mới đến hết chu kỳ 24h UTC.
- **Quyết định 3 (Tiêu chí kiểm định độc lập thăng hạng Challenger)**: Mô hình thuật toán Challenger chỉ được xem xét đề xuất thăng hạng khi vượt qua kiểm định độc lập Out-Of-Sample với **Profit Factor $\ge 1.20$** và **Net PnL dương** sau khi trừ đầy đủ ma trận phí sàn Bitget (0.06% x 2 Taker fee + 3.0 bps trượt giá + phí funding).

---

## 2. Forensic Audit Findings & Root Cause Analysis

Từ kết quả kiểm toán 926 bản ghi TradeID hợp lệ trong tệp `bitget_5bot_complete_audit_2026-11-08.csv`:

| Chỉ số kiểm toán | Số liệu đo đạc thực tế | Nguyên nhân gốc (Root Cause) |
| :--- | :--- | :--- |
| **Tổng số bản ghi** | 926 lệnh hợp lệ (100% BotID 4) | Tất cả lệnh được ghi nhận bởi Bot 4 Execution mà thiếu gắn thẻ nguồn gốc chiến lược (Bot 1, 2, 3, 5). |
| **Tổng Net PnL** | **-137.64 USDT** (Gross: -111.06, Phí: -26.58) | Tỷ lệ bất đối xứng lỗ/lãi quá lớn (Lỗ trung bình gấp 3.6x Lãi trung bình). |
| **Tỷ lệ thắng (Win Rate)** | **48.00%** (445 Thắng / 478 Thua) | Tỷ lệ thắng xấp xỉ 50% nhưng hệ số lợi nhuận cực thấp do chốt lời quá mỏng trong khi cắt lỗ quá sâu. |
| **Hệ số lợi nhuận (Profit Factor)** | **0.2585** (~0.26) | Tổng lãi (+47.99 USDT) không đủ bù đắp tổng lỗ (-185.63 USDT) và chi phí ma sát sàn. |
| **Sự kiện STOP_LOSS** | **499 lệnh** (chiếm 53.83%) | Stop Loss chưa có chốt chặn ngặt nghèo giới hạn mức lỗ tối đa theo ký quỹ. |
| **Lệnh giá 0 hoặc không hợp lệ** | **9 lệnh PEPEUSDT (giá = 0)** + 1 lệnh lãi ảo +20.72 USDT | Lỗi làm tròn số thập phân (8 số 0) và thiếu chốt chặn từ chối lệnh khi giá thị trường $\le 0$. |
| **Tài sản không hợp lệ (Unverified)** | **369 lệnh (-102.19 USDT lỗ)** | **Chiếm 74.2% tổng lỗ của toàn hệ thống** do giao dịch các mã synthetic CFD phi crypto (MINIMAX, ANTHROPIC, SKHY, SNDK, SOXL, SOXS, CL, KORU) có spread và trượt giá khổng lồ (lên tới 798 bps). |

---

## 3. Kiến Trúc Rebuild & Module Triển Khai

### Phase 1: Tạo Baseline Phục Hồi & Chốt Chặn Danh Sách Coin (Bot 1 & Specs)
- **Baseline Backup**: Đã lưu trữ toàn bộ mã nguồn vào `backups/baseline_20261108/`.
- **Danh sách Trắng Hợp đồng Bitget Crypto Futures**:
  - Thiết lập `VERIFIED_BITGET_CRYPTO_FUTURES_WHITELIST` chỉ cho phép các đồng tiền điện tử chính thống trên Bitget USDT-M (BTC, ETH, SOL, XRP, DOGE, AVAX, NEAR, LINK, BNB, SUI, ADA, PEPE, BCH, LTC, DOT, APT, ARB, OP, AAVE, HYPE, HOT, ONE, ZEC).
  - Triệt để cấm toàn bộ 22+ mã synthetic equity CFD và token thanh khoản kém.
  - Tối ưu hóa hàm `roundToTickSize` xử lý chuẩn xác 8 chữ số thập phân cho token meme (như PEPE).

### Phase 2: Tái Cấu Trúc Bot 4 Execution Engine (Thực Thi & Quản Trị Vị Thế)
- **Pre-Execution Gate**:
  - Nghiêm cấm vào lệnh khi `entryPrice <= 0`, `ticker.lastPr <= 0`, `ticker.askPr <= 0`, hoặc `ticker.bidPr <= 0`.
  - Từ chối lệnh khi giá thị trường bị trôi lệch quá 0.25% so với điểm vào của tín hiệu (Anti-Slippage drift).
- **Position Sizing & Clamping**:
  - Ký quỹ cố định nghiêm ngặt **2.0 USDT/lệnh**. Đòn bẩy tối đa **10x** (Notional = 20 USDT).
  - Khóa mức lỗ tối đa tại Stop Loss: **Không bao giờ vượt quá 50% mức ký quỹ** (tối đa mất 1.00 USDT trên 2.0 USDT ký quỹ).
  - Nguyên tắc bất di bất dịch: **Không bao giờ nới rộng Stop Loss**.
- **Take-Profit Net Edge Guarantee**:
  - Điểm chốt lời TP bắt buộc phải đảm bảo lãi ròng dương sau khi trừ đầy đủ chi phí sàn (0.06% x 2 phí Taker + 3 bps trượt giá + funding).
  - Tỷ lệ Risk/Reward tối thiểu bắt buộc $\ge 1:1.50$ (chuẩn 1:2.0).
- **Dynamic Break-Even**:
  - Khi vị thế đạt $\ge 45\%$ quãng đường tới TP hoặc lãi ròng $\ge +0.04$ USDT, tự động dời Stop Loss lên điểm hòa vốn (+16 bps cho LONG, -16 bps cho SHORT) để bảo toàn vốn risk-free.
- **Anti-Duplicate & Idempotency**:
  - Khóa SignalID trong 10 phút, ngăn chặn tuyệt đối lệnh trùng.
  - Tối đa 1 vị thế cho mỗi symbol (không giao dịch trùng coin).
  - Bổ sung hàm đóng khẩn cấp `closeAllPositions()` kích hoạt tức thì khi có sự cố.

### Phase 3: Tái Thiết Lập Independent Risk Governor (Tầng Quản Trị Rủi Ro Độc Lập)
- Áp dụng **Daily Loss Limit 5.0 USDT (5% vốn)**: Tự động ngắt mạch (Circuit Breaker) khi chạm ngưỡng.
- Giám sát chuỗi lệnh thua liên tiếp: Bắn cảnh báo Telegram và Log hệ thống ngay khi chạm 3 lệnh thua liên tiếp.
- Giới hạn tối đa **10 vị thế đồng thời**, tối đa 1 vị thế/coin.
- Trần Spread tối đa **0.03% (3.0 bps)**; trần độ trễ dữ liệu **30 giây**.
- Khẳng định quyết định **NO TRADE** là quyết định hợp lệ và được ưu tiên khi thị trường không có lợi thế thống kê.

### Phase 4: Nâng Cấp Bot 5 Independent Self-Learning & Quant Auditor
- **Phân loại nguyên nhân gốc hậu kiểm**:
  - Gắn thẻ chi tiết từng lệnh: `UNVERIFIED_SYNTHETIC_CFD`, `CORRUPTED_ZERO_PRICE`, `HIGH_SPREAD_SLIPPAGE_DRAG`, `LOSS_ASYMMETRY`, `PREMATURE_SL_TIMING`, `FALSE_BREAKOUT_CHOP`, `FUNDING_FEE_EROSION`, `HEALTHY_WIN_EFFICIENCY`.
- **Phân tích đa chiều**: Thống kê hiệu suất theo Symbol, Chiều (LONG/SHORT), Biến động (ATR), Khung giờ và Chiến lược.
- **Quy trình Kiểm định Độc lập (Independent Validator)**:
  - Walk-Forward Out-Of-Sample (60% In-Sample, 40% Out-Of-Sample).
  - Cổng phê duyệt: **Profit Factor $\ge 1.20$**, Net PnL $> 0$, Max Drawdown $\le 10\%$, Tỷ lệ Overfitting $\le 1.35$.
  - Bot 5 tuyệt đối không được tự ý sửa đổi chiến lược Champion trên môi trường thực tế.

### Phase 5: Báo Cáo Pháp Y & Kiểm Thử Tự Động Toàn Diện
- Đã xây dựng endpoint `/api/engine/audit/forensic-summary` phục vụ tra cứu báo cáo pháp y 8 mục.
- Đã xuất bản báo cáo kiểm toán pháp y đầy đủ tại `data/forensic_audit_report_20261108.json`.
- Đã xây dựng kịch bản kiểm thử tự động `scripts/test_master_directive_audit_v2.ts` chứng minh đầy đủ 8 yêu cầu của Master Directive.

---

## 4. Kết Quả Xác Minh & Kiểm Thử Tự Động (Verification Results: 100% Passed)

Toàn bộ 3 bộ kịch bản kiểm thử tự động đã được thực thi và xác nhận thành công 100%:

1. **Master Directive Forensic & Audit Suite** (`scripts/test_master_directive_audit_v2.ts`):
   - **21/21 TESTS PASSING (100%)**
   - Độc lập tái hiện chính xác 926 bản ghi, Net PnL -137.64 USDT, Win Rate 48.0%, Profit Factor 0.2585.
   - Chứng minh -102.19 USDT (74.2% tổng lỗ) bắt nguồn từ 369 lệnh trên các mã synthetic CFD.
   - Xác nhận chặn 100% giá $\le 0$, khóa ký quỹ 2.0 USDT, đòn bẩy 10x, kẹp SL $\le 50\%$ ký quỹ, Daily Loss Limit 5.0 USDT, và trần Spread 3.0 bps.

2. **TradingAgents Hybrid V2 Suite** (`scripts/test_tradingagents_hybrid_v2.ts`):
   - **31/31 TESTS PASSING (100%)**
   - 6 AI Analysts chuyên biệt (Technical, Market Structure, Volume, Momentum, Volatility, Sentiment).
   - Bull vs Bear Adversarial Debate & Research Manager fact-checking chống ảo giác.
   - Dynamic Break-Even (+16 bps) và Risk/Reward tối thiểu $\ge 1:1.50+$.

3. **Autonomous Engine V2 Suite** (`scripts/test_5bot_autonomous_v2.ts`):
   - **24/24 TESTS PASSING (100%)**
   - Vòng đời lệnh chuẩn: ONE ENTRY • ONE SL • ONE TP.
   - Sàn lọc thanh khoản Scanner, Bộ lọc thời gian Blackout (01:00-04:00 UTC) và Walk-Forward Out-Of-Sample.

4. **Biên Dịch & Linting**:
   - `compile_applet`: Build succeeded (Vite production bundle compiled).
   - `lint_applet`: 0 errors (TypeScript strict check passed).
   - Live Trading: PERMANENTLY DISABLED (Paper Trading 100 USDT).
