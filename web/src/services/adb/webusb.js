import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import { delay } from "../../shared/async.js";

/** Raised when the ADB USB interface is exclusively held by another program. */
export class UsbBusyError extends Error {
  constructor(cause) {
    super("The USB interface is already claimed by another program");
    this.name = "UsbBusyError";
    this.cause = cause;
  }
}

const isBusy = (error) =>
  error?.name === "DeviceBusyError" ||
  /already in use|already in used|DeviceBusy/i.test(
    `${error?.name ?? ""} ${error?.message ?? ""} ${error?.constructor?.name ?? ""}`,
  );

/** Release the interface so a failed attempt never blocks the next retry. */
async function release(raw) {
  try {
    await raw?.close();
  } catch {
    /* the device may already be closed or unplugged */
  }
}

/**
 * Thin wrapper around @yume-chan/adb-daemon-webusb.
 *
 * Windows/Chrome grant exclusive access to a USB interface: if adb.exe's
 * server, Android Studio, scrcpy or an emulator holds the ADB interface,
 * `claimInterface()` fails with a NetworkError, which the library reports as
 * DeviceBusyError. We translate it into a dedicated error so the UI can tell
 * the user exactly what to close, and we always release our own claims.
 */
export const webusb = {
  get supported() {
    return (
      typeof navigator !== "undefined" &&
      "usb" in navigator &&
      Boolean(AdbDaemonWebUsbDeviceManager.BROWSER)
    );
  },

  async request() {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) return null;
    return (await manager.requestDevice()) ?? null;
  },

  /**
   * Claim the ADB interface and return the packet connection.
   * @param {import("@yume-chan/adb-daemon-webusb").AdbDaemonWebUsbDevice} device
   */
  async open(device) {
    await release(device.raw);
    try {
      return await device.connect();
    } catch (error) {
      await release(device.raw);
      if (!isBusy(error)) throw error;

      // A previous failed attempt (or a just-closed adb server) can hold the
      // interface for a few hundred milliseconds. Retry once before failing.
      await delay(450);
      try {
        return await device.connect();
      } catch (retryError) {
        await release(device.raw);
        throw isBusy(retryError) ? new UsbBusyError(retryError) : retryError;
      }
    }
  },
};
