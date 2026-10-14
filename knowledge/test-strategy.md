---
title: Chiến lược test
topic: qe
reviewed: 2026-10-15
sources:
  - https://martinfowler.com/articles/practical-test-pyramid.html
  - https://martinfowler.com/bliki/ContractTest.html
  - https://martinfowler.com/bliki/ObjectMother.html
  - https://martinfowler.com/bliki/TestCoverage.html
---

# Chiến lược test

## Đặt test ở đúng tầng

| Tầng | Đặt ở đây | Vì sao |
|---|---|---|
| **unit** | Quy tắc nghiệp vụ: tính toán, kiểm tra dữ liệu, chuyển trạng thái | Nhanh, ổn định, chỉ đúng chỗ hỏng |
| **integration** | Hợp đồng giữa các phần: API, schema, mã lỗi, quyền | Bắt lệch giữa hai bên mà unit không thấy |
| **e2e** | Luồng app quan trọng đi qua màn hình và dịch vụ thật | Ít, chậm, chỉ cho hành trình chính |
| **smoke** | Một device, đường chính mở được | Chặn bản build hỏng sớm |
| **manual** | Khám phá, đánh giá trực quan, việc tự động hóa quá đắt | Có chủ đích, không phải mặc định |

Giữ dạng kim tự tháp: nhiều unit, ít integration hơn, rất ít e2e. Đừng viết e2e cho từng quy tắc kiểm tra dữ liệu.

## Smoke một device

Smoke trên một device **chỉ chứng minh đường chính mở được**: app cài được, mở được, tới màn hình đầu.
Nó không thay test chức năng và không nói gì về các device khác.

## Luồng dễ mất dữ liệu

Luồng ghi, xóa, thanh toán, đồng bộ hoặc gửi đi phải có thêm:

- test **biên** (giá trị giới hạn, danh sách rỗng và rất dài);
- test **lỗi** (mất mạng giữa chừng, server lỗi, bấm hai lần, app bị tắt);
- **một case từ chối quyền** (người không có quyền thử thao tác và bị chặn đúng cách).

## Dữ liệu test

Dùng **fixture, factory hoặc mock**, và phải là **dữ liệu giả**. Không dùng dữ liệu khách hàng thật, không chép từ production.
Mỗi test tự tạo dữ liệu mình cần và không phụ thuộc thứ tự chạy.

## Không đặt ngưỡng phần trăm coverage

Coverage cho biết chỗ nào **chưa** test, không cho biết test có tốt không. Đặt ngưỡng phần trăm dẫn tới test cho đủ số.
Thay vào đó: mọi tiêu chí chấp nhận có ít nhất một test case (xem ma trận truy vết), và mọi luồng dễ mất dữ liệu có đủ ba loại ở trên.

## Chiến lược cần ghi

1. Phạm vi và ngoài phạm vi.
2. Rủi ro và ưu tiên (khả năng hỏng × tác động).
3. Tầng test cho từng tiêu chí.
4. Dữ liệu và môi trường; device cho mobile.
5. Phần bị chặn bởi câu hỏi mở (ghi ID).
6. Điều kiện bắt đầu và điều kiện dừng.
