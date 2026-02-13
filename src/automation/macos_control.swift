import Cocoa
import Foundation
import ApplicationServices

func usage() {
    let text = """
    macos-control usage:
      macos-control click <x> <y>
      macos-control double-click <x> <y>
      macos-control type <text>
    """
    FileHandle.standardError.write(text.data(using: .utf8)!)
}

func ensureAccessibilityPermission() {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    if AXIsProcessTrustedWithOptions(options) {
        return
    }
    let message = "Accessibility permission is required. Enable it for manman in System Settings > Privacy & Security > Accessibility.\n"
    FileHandle.standardError.write(message.data(using: .utf8)!)
    exit(13)
}

func parseCoordinate(_ value: String) -> Double? {
    return Double(value.trimmingCharacters(in: .whitespacesAndNewlines))
}

func postMouseMove(_ point: CGPoint) {
    if let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) {
        move.post(tap: .cghidEventTap)
    }
}

func postClick(_ point: CGPoint, isDouble: Bool) {
    postMouseMove(point)

    guard
        let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
    else {
        return
    }

    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)

    if isDouble {
        usleep(50000)
        guard
            let down2 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
            let up2 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
        else {
            return
        }
        down2.setIntegerValueField(.mouseEventClickState, value: 2)
        up2.setIntegerValueField(.mouseEventClickState, value: 2)
        down2.post(tap: .cghidEventTap)
        up2.post(tap: .cghidEventTap)
    }
}

func postUnicodeText(_ text: String) {
    for scalar in text.utf16 {
        var chars: [UniChar] = [scalar]
        guard
            let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
            let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
        else {
            continue
        }
        down.keyboardSetUnicodeString(stringLength: 1, unicodeString: &chars)
        up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &chars)
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }
}

let args = CommandLine.arguments
if args.count < 2 {
    usage()
    exit(2)
}

let cmd = args[1].lowercased()

switch cmd {
case "click", "double-click":
    ensureAccessibilityPermission()
    guard args.count >= 4, let x = parseCoordinate(args[2]), let y = parseCoordinate(args[3]) else {
        usage()
        exit(2)
    }
    let point = CGPoint(x: x, y: y)
    postClick(point, isDouble: cmd == "double-click")
    exit(0)

case "type":
    ensureAccessibilityPermission()
    guard args.count >= 3 else {
        usage()
        exit(2)
    }
    let text = args.dropFirst(2).joined(separator: " ")
    postUnicodeText(text)
    exit(0)

default:
    usage()
    exit(2)
}
