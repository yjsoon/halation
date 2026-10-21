import Foundation

/// The Rewards Exposure card ("Sun Arc v3", `docs/frontend/rewards-exposure-card.md`):
/// the pure mapping from a projection to what the picture shows, and the scene
/// geometry the Canvas draws. Nothing here prints or speaks; `h` and `v` are
/// picture coordinates, never figures.
///
/// There are two journeys and they never share a value. Across (`h`) is the way
/// to the minimum: the light spreads left to right to a marker and the sun rides
/// the horizon. Up (`v`) is the way past it, through a tier and on to the bonus
/// cap: the sun rises from just above the ground to off the top edge.
struct RewardExposure: Equatable {
  enum Stage: Equatable { case gate, climb, rest, capped, calm, failed }
  enum Light: Equatable { case journey, even, overcast }

  /// The animated picture values, each 0...1.
  struct Pose: Equatable {
    /// Across: the fill of the minimum journey; 1 once it is met or when there is none.
    var h: Double
    /// Up: 0 resting just above the ground, 0.5 halfway, 1 off the top edge.
    var v: Double

    /// A fall (a refund, a new period) crossfades instead of gliding backwards.
    func falls(from old: Pose) -> Bool { h < old.h || v < old.v }
  }

  /// Where the sun rests, as a share of the width.
  static let column = 0.85
  /// Where the sun can ride the marker.
  static let ride = 0.07...0.85

  var stage: Stage
  var pose: Pose
  var miles: Bool
  /// The minimum journey's sun is amber while the tone is needs-minimum.
  var needsMinimum: Bool
  /// Whether the card ever had a minimum journey: where a first showing starts.
  var hasMinimum: Bool
  /// Changes when the target does: another action kind, basis target or deadline end.
  var target: String
  /// Where in the period the minimum was met, 0…1: where the phone's two slopes meet. Nil when unknown.
  var metAt: Double?

  var light: Light { stage == .failed ? .overcast : stage == .calm ? .even : .journey }
  var hasSun: Bool { stage != .failed }
  /// The brand pair, apart at rest: no journey to show.
  var ridgesApart: Bool { stage == .failed || stage == .calm }

  /// Where a first showing starts: a card with a minimum sweeps across and then rises.
  var journeyStart: Pose {
    switch stage {
    case .gate: return Pose(h: 0, v: 0)
    case .climb, .rest, .capped: return Pose(h: hasMinimum ? 0 : 1, v: 0)
    case .calm, .failed: return pose
    }
  }

  /// Nil for range rows, which draw no picture.
  init?(_ p: RewardRowProjection) {
    let minimum = Self.amount(p.minimumAmount)
    let tier = Self.amount(p.reachedTierThreshold)
    switch p.action {
    case .range:
      return nil
    case .qualificationFailed:
      stage = .failed
      pose = Pose(h: 0, v: 0)
    case .monthlyMinimum, .minimum:
      stage = .gate
      pose = Pose(h: Self.clamp(p.fill ?? 0), v: 0)
    case .nextTier:
      stage = .climb
      // Once a tier is reached the sun stays at halfway: it never sinks towards a further tier.
      var v = tier > 0 ? 0.5 : 0
      if tier == 0, let spend = p.basis?.spend, let next = p.basis?.target {
        let from = minimum < next ? minimum : 0
        v = 0.5 * Self.ratio(spend - from, next - from)
      }
      pose = Pose(h: 1, v: v)
    case .capHeadroom:
      stage = .climb
      let base = tier > 0 ? 0.5 : 0
      var v = base
      if let counted = p.basis?.spend, let cap = p.basis?.target {
        let foot = tier > 0 ? tier : minimum
        let from = cap > foot ? foot : 0
        v = base + (1 - base) * Self.ratio(counted - from, cap - from)
      }
      pose = Pose(h: 1, v: v)
    case .capReached:
      // The partial block and the exceeded cap included: the picture follows the action.
      stage = .capped
      pose = Pose(h: 1, v: 1)
    case .topTier:
      stage = .rest
      pose = Pose(h: 1, v: 0.5)
    case .minimumMet:
      stage = .rest
      pose = Pose(h: 1, v: 0)
    case .noTarget:
      stage = .calm
      pose = Pose(h: 1, v: 0)
    }
    miles = p.rewardType == .miles
    needsMinimum = p.tone == .needsMinimum
    hasMinimum = minimum > 0
    target = "\(Self.kind(p.action))|\(p.basis?.target ?? 0)|\(p.deadline?.end ?? "")"
    metAt = p.minimumMetAt
  }

  /// A plain amount: finite and positive, else 0.
  private static func amount(_ x: Double) -> Double { x.isFinite && x > 0 ? x : 0 }
  private static func clamp(_ x: Double) -> Double { x.isFinite ? min(1, max(0, x)) : 0 }
  /// Progress over a span; a span that is not positive counts as complete.
  private static func ratio(_ x: Double, _ over: Double) -> Double { over > 0 ? clamp(x / over) : 1 }

  private static func kind(_ action: RewardRowProjection.Action) -> String {
    switch action {
    case .monthlyMinimum: return "monthly"
    case .minimum: return "minimum"
    case .nextTier: return "tier"
    case .capHeadroom, .capReached: return "cap"
    default: return "none"
    }
  }
}

/// Everything else the scene needs, derived from the pose and never stored.
extension RewardExposure.Pose {
  /// How far the sun has lifted clear of the horizon, over h 0.85 to 1.
  var lift: Double { min(1, max(0, (h - 0.85) / 0.15)) }
  /// The sun's x as a share of the width, riding the marker while the minimum journey runs.
  var sunX: Double { h >= 1 ? RewardExposure.column : min(max(h, RewardExposure.ride.lowerBound), RewardExposure.ride.upperBound) }
  /// The sun's centre y for a target horizon at `horizon` and a disc of radius `r` (y points down).
  /// `seat` is how far below the horizon the centre sits while the sun rides it, as a share of `r`:
  /// a hair below on the hero, and exactly on it on the phone strip, where the disc is a clean half-sun.
  /// `lift` is how far it has lifted clear: the pose's own by default, and 0 for a card whose minimum
  /// is unmet, whose sun stays on the horizon however close the spend is.
  func sunY(horizon: Double, r: Double, seat: Double = 0.08, lift: Double? = nil) -> Double {
    let sit = horizon + seat * r
    let rest = horizon - 1.15 * r
    return h < 1 ? sit + (rest - sit) * (lift ?? self.lift) : rest + (-1.05 * r - rest) * v
  }
}

/// Light mode draws daytime faces; dark mode draws the night and dusk prints.
enum FaceAppearance: Equatable { case daytime, print }

/// Where the scene sits in its row.
enum ExposureLayout: Equatable {
  /// A board row: the ridges follow the measured bottom of the name's line box and
  /// top of the headline, so long names and large text move the ridges rather than
  /// overlap them. Nil falls back to estimates until the first measurement.
  case strip(nameBottom: Double?, footTop: Double?)
  /// The 64pt scene band above the text at accessibility sizes.
  case band
  /// A framed print: the detail sheet's 3:2 hero and the register's 90 × 60pt thumbnail. The full
  /// scene: the brand ridges, a level spend floor, the posterised rings and the hairline marker.
  case photo

  /// The phone strip and band: the sun is the marker, and one soft glow stands in for the rings.
  var isPhone: Bool { self != .photo }
}

/// The brand ridges' rise (the app icon's two slopes), sampled at 65 even x from the web's shipped
/// paths (`reward-exposure-scene.ts` BACK_RISE) and kept in step with them: 1 at the
/// left edge, where the ridge is lowest, and 0 at the right, where it is highest. The phone's
/// horizons take this shape.
enum BrandRise {
  static let back: [Double] = [1, 0.989, 0.977, 0.964, 0.95, 0.935, 0.92, 0.905, 0.889, 0.874, 0.859, 0.845, 0.833, 0.822, 0.813, 0.806, 0.801, 0.799, 0.8, 0.803, 0.801, 0.795, 0.783, 0.766, 0.744, 0.719, 0.69, 0.659, 0.627, 0.596, 0.567, 0.539, 0.515, 0.494, 0.476, 0.462, 0.448, 0.433, 0.416, 0.399, 0.38, 0.361, 0.341, 0.321, 0.3, 0.28, 0.259, 0.24, 0.22, 0.201, 0.183, 0.166, 0.151, 0.138, 0.127, 0.119, 0.111, 0.104, 0.097, 0.089, 0.08, 0.067, 0.05, 0.028, 0]

  /// The brand back ridge's crest as a share of the frame height (the brand art in the bottom 58%): the
  /// print's target horizon, from `reward-exposure-scene.ts` BACK_CREST.
  static let backCrest: [Double] = [0.6654, 0.6628, 0.6599, 0.6567, 0.6533, 0.6497, 0.6459, 0.6421, 0.6383, 0.6346, 0.631, 0.6277, 0.6246, 0.622, 0.6198, 0.6181, 0.617, 0.6165, 0.6167, 0.6173, 0.617, 0.6154, 0.6125, 0.6084, 0.6031, 0.5969, 0.5899, 0.5824, 0.5747, 0.5671, 0.5598, 0.5532, 0.5472, 0.5421, 0.5379, 0.5344, 0.531, 0.5272, 0.5232, 0.5189, 0.5145, 0.5098, 0.505, 0.5, 0.495, 0.49, 0.485, 0.4802, 0.4755, 0.4709, 0.4665, 0.4624, 0.4586, 0.4554, 0.4529, 0.4508, 0.4489, 0.4473, 0.4456, 0.4436, 0.4412, 0.4381, 0.434, 0.4287, 0.4219]

  /// The brand front ridge's crest, the same way (FRONT_CREST): the floor of a print with no journey.
  static let frontCrest: [Double] = [0.8104, 0.8081, 0.8057, 0.8031, 0.8004, 0.7977, 0.795, 0.7924, 0.7899, 0.7877, 0.7857, 0.7841, 0.7829, 0.7823, 0.7822, 0.7828, 0.7841, 0.7852, 0.7843, 0.7814, 0.7766, 0.7701, 0.7623, 0.754, 0.7458, 0.7383, 0.7317, 0.7263, 0.722, 0.719, 0.7172, 0.7168, 0.7178, 0.7198, 0.7226, 0.7256, 0.7281, 0.7298, 0.7303, 0.7292, 0.7267, 0.7228, 0.7181, 0.7127, 0.7067, 0.7001, 0.6929, 0.6851, 0.6768, 0.6683, 0.6596, 0.6511, 0.6428, 0.6352, 0.6283, 0.6224, 0.6176, 0.6139, 0.6109, 0.6085, 0.6064, 0.6041, 0.6013, 0.5972, 0.591]

  /// The rise at `u`, a share of the width, interpolated between samples.
  static func at(_ table: [Double], _ u: Double) -> Double {
    let f = min(1, max(0, u)) * Double(table.count - 1)
    let i = min(table.count - 2, Int(f))
    return table[i] + (table[i + 1] - table[i]) * (f - Double(i))
  }
}

/// The scene's geometry for one frame, in points. Pure: the Canvas draws it.
struct ExposureScene {
  let width: Double
  let height: Double
  let layout: ExposureLayout
  let exposure: RewardExposure
  let pose: RewardExposure.Pose
  let appearance: FaceAppearance

  /// The sun's radius.
  var sunRadius: Double {
    switch layout {
    case .strip: return 10
    case .band: return 7
    case .photo: return 0.045 * width
    }
  }

  /// The target horizon's range: the brand back ridge's rise, from `low` at the left edge to
  /// `high` at the right, where the sun's column is. On the strip it runs from 14pt under the
  /// name to 2pt under it.
  private var horizonRange: (high: Double, low: Double) {
    switch layout {
    case .strip(let nameBottom, _):
      let name = nameBottom ?? 0.28 * height
      return (name + 2, name + 14)
    case .band: return (0.42 * height, 0.56 * height)
    case .photo: return (0.42 * height, 0.665 * height)
    }
  }

  /// How far below the target horizon the spend floor runs: the floor is the horizon's own shape, as far
  /// down as the words allow (3pt above the foot at its lowest, the left edge). The lower slope starts
  /// there and its far end rises as the minimum fills.
  private var floorGap: Double {
    switch layout {
    case .strip(_, let footTop):
      let foot = footTop ?? 0.58 * height
      return max(4, foot - 3 - horizonRange.low)
    case .band: return 0.26 * height
    case .photo: return 0
    }
  }

  /// The target horizon `U(x)` at `u`, a share of the width: the icon's back slope.
  func horizonY(at u: Double) -> Double {
    if layout == .photo { return height * BrandRise.at(BrandRise.backCrest, u) }
    let range = horizonRange
    return range.high + (range.low - range.high) * BrandRise.at(BrandRise.back, u)
  }

  /// The spend floor `Fl(x)`: the target horizon's shape, `floorGap` below it.
  func floorY(at u: Double) -> Double {
    guard layout == .photo else { return horizonY(at: u) + floorGap }
    // The print's floor is level, with a faint swell; a card with no journey keeps the brand pair apart.
    if exposure.ridgesApart { return height * BrandRise.at(BrandRise.frontCrest, u) }
    return height * (0.8 + 0.01 * sin(u * 8.2 + 0.4))
  }

  /// How far the spend horizon's far end has lifted: the fill of the minimum journey. Failed and untargeted
  /// cards, and cards with no minimum, keep the pair apart: the convergence is the minimum's own read.
  private var across: Double {
    if exposure.ridgesApart { return 0 }
    return layout.isPhone && !exposure.hasMinimum ? 0 : pose.h
  }

  /// The spend horizon. The lower slope is anchored at the left, as low as the words allow, and only its
  /// far end rises: with the fill, until the minimum is met, when it meets the target where in the period
  /// that happened (`metAt`) and runs with it from there. So the meeting point reads as when the minimum
  /// was met.
  func spendY(at u: Double) -> Double {
    let floor = floorY(at: u)
    let horizon = horizonY(at: u)
    if across <= 0 { return floor }
    // The print's lower line lifts towards the target everywhere at once, so it cannot cross it.
    if layout == .photo { return floor + min(1, across) * (horizon - floor) }
    let metAt = min(1, max(0, exposure.metAt ?? 1))
    let metShare = metAt <= 0 ? 1 : min(1, u / metAt)
    if across >= 0.999 { return floor - (floor - horizon) * metShare }
    // A card whose minimum is met eases from the linear rise to its met shape over the last fifth of the
    // journey, so the lower slope does not jump at the final frame.
    let settle = exposure.metAt == nil ? 0 : min(1, max(0, (across - 0.8) / 0.2))
    return floor - (floor - horizon) * ((1 - settle) * across * u + settle * metShare)
  }

  /// The minimum is met: the spend horizon has reached the target, and its crest brightens.
  var isMet: Bool { across >= 0.999 }

  /// Both ridges are one line across the whole width, so the target crest is dropped. On the phone the
  /// lines coincide only from the met day on, so a card met part-way through the period keeps it.
  var isMerged: Bool { isMet && (layout == .photo || (exposure.metAt ?? 1) >= 1) }

  /// The sun's centre, nil when there is none. On the phone it sits exactly on the horizon, a clean
  /// half-sun, and lifts clear from there once the minimum is met.
  var sun: (x: Double, y: Double)? {
    guard exposure.hasSun else { return nil }
    let u = pose.sunX
    let seat = layout.isPhone ? 0 : 0.08
    return (u * width, pose.sunY(horizon: horizonY(at: u), r: sunRadius, seat: seat, lift: lifted))
  }

  /// The glow's radius `R`: grows with the climb, capped by the frame's height. The phone draws one
  /// smooth falloff rather than the posterised rings, which a short frame clips into arcs.
  var ringRadius: Double {
    let r = (0.14 + 0.24 * pose.v) * width
    return layout.isPhone ? min(r, (0.42 + 0.6 * pose.v) * height) : r
  }

  /// How far the sun has lifted clear of the horizon. The lift exists for the hand-over to the climb (a
  /// met card's first showing sweeps `h` to 1 and lights the last of the band as the sun lifts), never
  /// for a gate card: an unmet minimum keeps its half-sun on the horizon however close the spend is.
  var lifted: Double { exposure.stage == .gate ? 0 : pose.lift }

  /// Where the light ends, as a share of the width. The phone's sun is the marker, so the light reaches
  /// no further than the sun's column: the last of the band stays dusk until the minimum is met, and a
  /// card at 98% still shows what is left. A met card's first showing sweeps to the edge as before.
  var litEdge: Double {
    exposure.stage == .gate && layout.isPhone ? min(pose.h, RewardExposure.ride.upperBound) : pose.h
  }

  /// How much of the light past the edge the sun's lift has already let through. Only the phone
  /// lets the last of the band light as its sun lifts; the print has its marker to show the edge.
  var beyondEdge: Double { layout.isPhone ? lifted : 0 }

  var haloOpacity: Double { 0.4 + 0.6 * pose.v }

  /// The light is still spreading towards the marker: the whole of the gate, however close the fill
  /// (a card $2 short of $2,000 keeps its dusk), and a met card's first showing while its sweep runs,
  /// so the lit edge sweeps to the right edge instead of the whole band lighting at once.
  var inMinimumJourney: Bool { exposure.stage == .gate || (exposure.light == .journey && pose.h < 0.999) }

  /// The veil's soft edge, in points: full light to the left of `from`, full veil right of `to`.
  /// A failed card is veiled everywhere. Nil once there is no minimum journey to show.
  var veilEdge: (from: Double, to: Double)? {
    if exposure.stage == .failed { return (-0.08 * width, 0) }
    guard inMinimumJourney else { return nil }
    return ((litEdge - 0.04) * width, (litEdge + 0.04) * width)
  }

  /// The veil's peak, 0 to 1: full while the sun rides, fading as it lifts; a failed card keeps it.
  var veilStrength: Double { exposure.stage == .failed ? 1 : 1 - beyondEdge }

  /// Light mode: the lit wash over the sky as a peak alpha, or nil when there is none. The ground is never lit.
  var litAlpha: Double? {
    guard appearance == .daytime else { return nil }
    switch exposure.light {
    case .overcast: return nil
    case .even: return 0.42
    case .journey: return 0.76 + 0.16 * pose.v
    }
  }

  /// Dark mode: the bloom's alpha over the sky.
  var bloomAlpha: Double {
    appearance == .print && exposure.light == .journey ? 0.3 * pose.v : 0
  }

  /// The pour from the top edge: its alpha and radius (in points). Fades in from `v` 0.4.
  var pour: (alpha: Double, radius: Double)? {
    guard exposure.hasSun, exposure.light == .journey else { return nil }
    let night = appearance == .print && exposure.miles
    let peak = appearance == .print && !exposure.miles ? 0.45 : 0.65
    let alpha = peak * min(1, max(0, (pose.v - 0.4) / 0.6))
    guard alpha > 0 else { return nil }
    return (alpha, (night ? 0.35 : layout.isPhone ? 0.62 : 0.78) * width)
  }

  /// Rings and glow add light by screen blend, except on the dusk print.
  /// Every face adds light: the daytime skies, the night print and, since it went amber, the dusk print.
  var glowScreens: Bool { true }

  /// The hairline at `x = h × W`, prints only, in the minimum journey: its x and the runs it draws,
  /// broken across the visible half of the sun's disc as in the brand mark. Nil when there is none.
  var marker: (x: Double, runs: [ClosedRange<Double>])? {
    guard !layout.isPhone, exposure.stage == .gate, pose.h < 1 else { return nil }
    let x = pose.h * width
    let top = 0.06 * height
    guard let sun, abs(x - sun.x) < sunRadius + 4 else { return (x, [top...height]) }
    let pad = max(1, 0.003 * width)
    let above = max(top, sun.y - sunRadius - pad)
    let below = min(height, sun.y + sunRadius + pad)
    return (x, [top...above, below...height].filter { $0.upperBound - $0.lowerBound > 0.5 })
  }

  /// The tick on the target horizon at the sun's column, prints only, in the minimum journey: where
  /// the sun will rest.
  var minimumTick: (x: Double, y: Double)? {
    guard !layout.isPhone, exposure.stage == .gate else { return nil }
    let u = RewardExposure.column
    return (u * width, horizonY(at: u))
  }
}
