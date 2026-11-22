export const KEY_CODES = {
    back: 4,
    home: 3,
    recents: 187,
    vol_up: 24,
    vol_down: 25,
    mute: 164,
    power: 26,
    enter: 66,
    del: 67,
    wake: 224,
    sleep: 223,
};
export async function pressKey(adb, key, longPress = false) {
    const code = KEY_CODES[key];
    await adb.shell(`input keyevent ${longPress ? "--longpress " : ""}${code}`, 10_000);
}
