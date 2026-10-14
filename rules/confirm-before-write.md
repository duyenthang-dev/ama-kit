---
id: confirm-before-write
title: Xác nhận trước khi ghi hoặc tốn tài nguyên
scope: always
triggers:
  - comment jira
  - sửa page confluence
  - upload app
  - chạy session
  - --yes
---

# Xác nhận trước khi ghi hoặc tốn tài nguyên

Các thao tác sau cần người dùng đồng ý rõ ràng trong cuộc trò chuyện, **mỗi lần**:

| Thao tác | Lệnh | Cách xác nhận |
|---|---|---|
| Thêm comment lên Jira | `jira comment <KEY> --file <md>` | Chạy không `--yes` để xem trước, cho người dùng xem, hỏi; đồng ý thì chạy lại với `--yes` |
| Sửa page Confluence | (kit chưa hỗ trợ) | Không tự sửa page; đưa nội dung đề xuất để người dùng tự dán |
| Upload app lên device cloud | `mobile-test upload`, `mobile-test run` | Chạy không `--yes` để thấy kế hoạch, hỏi, rồi mới `--yes` |
| Mở session thiết bị thật | `mobile-test run` | Như trên; nói rõ việc này tốn phút của gói |

Không bao giờ:

- tự thêm `--yes` khi người dùng chưa trả lời, hoặc suy ra đồng ý từ một yêu cầu chung chung ("làm hết đi") mà chưa cho họ xem trước;
- đổi trạng thái, người làm hay field của issue Jira (kit không có lệnh cho việc này);
- gửi lên Jira nội dung có đường dẫn file local, token, email hay số tài khoản.
