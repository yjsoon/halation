import SwiftUI
import UIKit

/// First run: keep the ledger on this device, or sign in to a server.
struct WelcomeView: View {
  @Environment(AppModel.self) private var model
  @State private var isStarting = false
  @State private var errorMessage: String?

  private let device = UIDevice.current.model
  // The welcome uses the web front page's paper, ink and plum, not ledger colours.
  private let paper = Color(light: 0xF8F4EE, dark: 0x1C161C)
  private let ink = Color(light: 0x231D1F, dark: 0xF3EAEC)
  private let secondaryInk = Color(light: 0x5F5457, dark: 0xBCAEB4)
  private let accent = Color(light: 0x7D4F72, dark: 0xD1A3C6)

  var body: some View {
    GeometryReader { geometry in
      ScrollView {
        VStack(spacing: 0) {
          VStack(alignment: .leading, spacing: 0) {
            Text("Halation")
              .font(.custom(CardType.serifItalic, size: 76, relativeTo: .largeTitle))
              .tracking(-2)
              .lineLimit(1)
              .minimumScaleFactor(0.4)
              .accessibilityAddTraits(.isHeader)
            Text("Clarity for a longer view")
              .font(.custom(CardType.serifItalic, size: 30, relativeTo: .title))
              .padding(.top, 4)

            actions
              .padding(.top, 36)
          }
          .foregroundStyle(ink)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: 420, alignment: .leading)
          .padding(.horizontal, 28)
          .padding(.top, 28)

          Spacer(minLength: 24)

          // Reuse the actual web illustration. Right anchoring keeps the sun in
          // view on phones; the alpha fade blends its sky into either paper.
          Image("WelcomeLandscape")
            .resizable()
            .scaledToFill()
            .frame(width: geometry.size.width, height: min(380, max(240, geometry.size.height * 0.38)), alignment: .bottomTrailing)
            .clipped()
            .mask {
              LinearGradient(stops: [
                .init(color: .clear, location: 0),
                .init(color: .black, location: 0.35),
              ], startPoint: .top, endPoint: .bottom)
            }
            .accessibilityHidden(true)
            .allowsHitTesting(false)
        }
        .frame(minHeight: geometry.size.height)
      }
      .scrollIndicators(.hidden)
    }
    .background(paper.ignoresSafeArea())
    .ignoresSafeArea(edges: [.horizontal, .bottom])
  }

  private var actions: some View {
    VStack(spacing: 14) {
      if let errorMessage {
        Text(errorMessage)
          .font(.footnote)
          .foregroundStyle(Theme.outflow)
          .multilineTextAlignment(.center)
      }
      Button(action: start) {
        HStack(spacing: 8) {
          if isStarting {
            ProgressView()
              .tint(paper)
          }
          Text("Start on this \(device)")
        }
        .font(.headline)
        .frame(maxWidth: .infinity, minHeight: 28)
        .padding(.vertical, 8)
        .foregroundStyle(paper)
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.roundedRectangle(radius: 12))
      .tint(accent)
      .disabled(isStarting)
      .accessibilityIdentifier("welcome-start-local")

      Text("Your records stay on this \(device). No sign-in needed.")
        .font(.footnote)
        .foregroundStyle(secondaryInk)
        .multilineTextAlignment(.center)

      Button("Connect to a server") {
        model.showConnectionFromWelcome()
      }
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(accent)
      .frame(maxWidth: .infinity, minHeight: 44)
      .contentShape(Rectangle())
      .disabled(isStarting)
      .accessibilityIdentifier("welcome-connect-server")
    }
  }

  private func start() {
    isStarting = true
    errorMessage = nil
    Task {
      do {
        try await model.startOnThisDevice()
      } catch {
        errorMessage = "Couldn’t set up this \(device). \(error.localizedDescription)"
      }
      isStarting = false
    }
  }
}
