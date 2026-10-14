// Đặt tên test theo ID test case để truy vết về test-cases.json. Thay locator bằng accessibility id của app.
describe('smoke', () => {
  it('TC-1 app mở tới màn hình đầu', async () => {
    const anyView = await $('android=new UiSelector().resourceIdMatches(".+")');
    await anyView.waitForDisplayed({ timeout: 30000 });
    await expect(anyView).toBeDisplayed();
  });
});
