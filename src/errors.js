// Lỗi có mã thoát cố định. CLI in một dòng dễ đọc thay vì stack trace.
//   0  xong
//   1  lỗi API (mạng, HTTP lỗi, phản hồi không hợp lệ)
//   2  sai cách dùng (tham số, cờ bị cấm, config sai)
//   3  thiếu biến môi trường

export class AmaError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

export class UsageError extends AmaError {
  constructor(message) {
    super(message, 2);
  }
}

export class MissingEnvError extends AmaError {
  /** @param {string[]} names chỉ tên biến, không bao giờ là giá trị */
  constructor(names, hint = '') {
    const list = names.join(', ');
    super(`Thiếu biến môi trường: ${list}.${hint ? ' ' + hint : ''} Xem .env.example và skill setup.`, 3);
    this.names = names;
  }
}

export class ApiError extends AmaError {
  constructor(message, status) {
    super(message, 1);
    this.status = status;
  }
}

/** Kept for code that only needs "something the user must fix" (usage). */
export const UserError = UsageError;
