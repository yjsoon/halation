// Renders a synthetic receipt PNG for the intake-provider E2E.
// Run: xcrun swift make_receipt.swift "<line1>" "<line2>" "<line3>" out.png
// All merchants/amounts are fake. No real financial data.
import AppKit

let args = CommandLine.arguments
guard args.count >= 5 else {
  fputs("usage: make_receipt.swift <line1> <line2> <line3> <out.png>\n", stderr)
  exit(2)
}
let lines = Array(args[1..<4])
let outPath = args[4]

let width = 1170, height = 640
let image = NSImage(size: NSSize(width: width, height: height))
image.lockFocus()
NSColor.white.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()
let attrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.monospacedSystemFont(ofSize: 64, weight: .regular),
  .foregroundColor: NSColor.black,
]
var y = height - 140
for line in lines {
  line.draw(at: NSPoint(x: 70, y: y), withAttributes: attrs)
  y -= 110
}
image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
  fputs("could not render PNG\n", stderr)
  exit(1)
}
try png.write(to: URL(fileURLWithPath: outPath))
print("wrote \(outPath)")
