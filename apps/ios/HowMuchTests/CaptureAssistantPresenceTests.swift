import XCTest
@testable import HowMuch

final class CaptureAssistantPresenceTests: XCTestCase {
  func testReduceMotionShowsTheCurrentLineInFull() {
    let id = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
    let script = CaptureAssistantPresence.script(messageID: id, hasAttachments: false, phase: nil)
    let frame = CaptureAssistantPresence.waitingFrame(
      messageID: id,
      hasAttachments: false,
      phase: nil,
      elapsed: 0,
      reduceMotion: true
    )
    XCTAssertEqual(frame.visibleText, script[0])
    XCTAssertFalse(frame.showsCursor)
  }

  func testLongWaitLandsOnTheLastLineFullyTyped() {
    let id = UUID(uuidString: "12345678-1234-1234-1234-1234567890AB")!
    let script = CaptureAssistantPresence.script(messageID: id, hasAttachments: false, phase: nil)
    let frame = CaptureAssistantPresence.waitingFrame(
      messageID: id,
      hasAttachments: false,
      phase: nil,
      elapsed: 12,
      reduceMotion: false
    )
    XCTAssertEqual(frame.fullLine, script.last)
    XCTAssertEqual(frame.visibleText, script.last)
    XCTAssertTrue(frame.showsCursor)
  }
}
