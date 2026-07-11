import Cocoa
import Carbon.HIToolbox

private let hotKeyCallback: EventHandlerUPP = { _, _, _ in
    if let delegate = NSApp.delegate as? HotKeyApp {
        delegate.showPrompt()
    }
    return noErr
}

class HotKeyApp: NSObject, NSApplicationDelegate {
    private var hotKeyRef: EventHotKeyRef?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let keyCode: UInt32 = 19 // "2"
        let modifiers: UInt32 = UInt32(cmdKey) | UInt32(shiftKey)

        var hotKeyID = EventHotKeyID(signature: OSType(0x71756B31), id: 1) // "quk1"
        RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)

        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), hotKeyCallback, 1, &eventType, nil, nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let hk = hotKeyRef {
            UnregisterEventHotKey(hk)
        }
    }

    func showPrompt() {
        let alert = NSAlert()
        alert.messageText = "Enter text:"
        let tf = NSTextField(frame: NSRect(x: 0, y: 0, width: 250, height: 24))
        alert.accessoryView = tf
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn {
            let text = tf.stringValue
            if !text.isEmpty {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(text, forType: .string)
                if let url = URL(string: "obsidian://quick-input") {
                    NSWorkspace.shared.open(url)
                }
            }
        }
    }
}

let app = NSApplication.shared
let delegate = HotKeyApp()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run() 