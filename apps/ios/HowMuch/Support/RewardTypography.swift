import SwiftUI
import UIKit

/// The Rewards card's type, bundled under `Fonts/` (SIL OFL 1.1, licences beside the files):
/// Instrument Serif Italic for the card name, IBM Plex Sans for the words and IBM Plex Mono for
/// the figures. Card only; the rest of the app keeps the system fonts. Every size is relative to
/// a text style, so Dynamic Type scales it.
enum CardType {
  enum Weight: Int, CaseIterable {
    case regular, medium, semibold, bold

    /// Bold Text steps each weight up one.
    func stepped(_ bold: Bool) -> Self { bold ? Self(rawValue: min(rawValue + 1, Self.bold.rawValue))! : self }
  }

  /// PostScript names, read from the files (`fc-scan`), not guessed.
  static let serifItalic = "InstrumentSerif-Italic"

  static func sansName(_ weight: Weight) -> String {
    switch weight {
    case .regular: return "IBMPlexSans"
    case .medium: return "IBMPlexSans-Medm"
    case .semibold: return "IBMPlexSans-SmBld"
    case .bold: return "IBMPlexSans-Bold"
    }
  }

  static func monoName(_ weight: Weight) -> String {
    switch weight {
    case .regular: return "IBMPlexMono"
    case .medium: return "IBMPlexMono-Medm"
    case .semibold: return "IBMPlexMono-SmBld"
    case .bold: return "IBMPlexMono-Bold"
    }
  }

  /// The card name. Instrument Serif has one weight and is display-sized, so Bold Text leaves it.
  static func name(_ size: CGFloat = 19, relativeTo style: Font.TextStyle = .title3) -> Font {
    .custom(serifItalic, size: size, relativeTo: style)
  }

  static func sans(_ weight: Weight, _ size: CGFloat, relativeTo style: Font.TextStyle, bold: Bool) -> Font {
    .custom(sansName(weight.stepped(bold)), size: size, relativeTo: style)
  }

  static func mono(_ weight: Weight, _ size: CGFloat, relativeTo style: Font.TextStyle, bold: Bool) -> Font {
    .custom(monoName(weight.stepped(bold)), size: size, relativeTo: style)
  }

  /// A fixed-size mono label for art annotations, which never scale with Dynamic Type.
  static func fixedMono(_ size: CGFloat) -> Font {
    .custom(monoName(.regular), fixedSize: size)
  }

  static var allNames: [String] {
    [serifItalic] + Weight.allCases.map(sansName) + Weight.allCases.map(monoName)
  }

  /// `Font.custom` falls back to SF without a word, so a debug launch checks each name resolves.
  static func assertBundled() {
    #if DEBUG
    for name in allNames {
      assert(UIFont(name: name, size: 12) != nil, "Rewards card font \(name) is not bundled; check UIAppFonts")
    }
    #endif
  }
}
