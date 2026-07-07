//
//  BonDiariWidget.swift
//  Widget de pantalla d'inici per a El Bon Diari.
//
//  Mostra la bona notícia més recent del radar (imatge + titular + secció) i
//  s'actualitza sol demanant l'API pública https://bondiari.com/api/live-news.
//  No cal App Group ni cap dada compartida: el widget baixa la portada
//  directament de la xarxa, així que sempre és fresc.
//
//  Aquest fitxer és autònom: conté el model, el proveïdor de timeline, les
//  vistes (petit i mitjà) i el @main WidgetBundle. Substitueix els fitxers
//  que Xcode genera automàticament en crear el target "Widget Extension".
//

import WidgetKit
import SwiftUI

// MARK: - Model (coincideix amb el JSON de /api/live-news)

struct Story: Decodable {
    let title: String
    let category: String?
    let source: String?
    let imageUrl: String?
    let url: String?
    let publishedAt: String?

    static let sample = Story(
        title: "Una bona notícia t'espera cada matí a El Bon Diari",
        category: "Portada",
        source: "El Bon Diari",
        imageUrl: nil,
        url: "https://bondiari.com",
        publishedAt: nil
    )
}

struct LiveNewsPayload: Decodable {
    let updatedAt: String?
    let stories: [Story]
}

// MARK: - Entry

struct NewsEntry: TimelineEntry {
    let date: Date
    let story: Story?
    let imageData: Data?
}

// MARK: - Provider

struct Provider: TimelineProvider {
    private let endpoint = URL(string: "https://bondiari.com/api/live-news")!

    func placeholder(in context: Context) -> NewsEntry {
        NewsEntry(date: Date(), story: .sample, imageData: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (NewsEntry) -> Void) {
        Task {
            completion(await fetchEntry())
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NewsEntry>) -> Void) {
        Task {
            let entry = await fetchEntry()
            // El radar del web es refresca cada 4 h; tornem a demanar dins d'una
            // hora perquè el widget es mantingui viu sense malgastar bateria.
            let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date())
                ?? Date().addingTimeInterval(3600)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func fetchEntry() async -> NewsEntry {
        do {
            var request = URLRequest(url: endpoint)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 12
            request.setValue("BonDiariWidget/1.0", forHTTPHeaderField: "User-Agent")

            let (data, _) = try await URLSession.shared.data(for: request)
            let payload = try JSONDecoder().decode(LiveNewsPayload.self, from: data)
            let story = payload.stories.first

            var imageData: Data?
            if let urlString = story?.imageUrl, let imageURL = URL(string: urlString) {
                imageData = try? await URLSession.shared.data(from: imageURL).0
            }
            return NewsEntry(date: Date(), story: story, imageData: imageData)
        } catch {
            // Sense xarxa o error d'API: mostrem la marca, no un widget buit.
            return NewsEntry(date: Date(), story: nil, imageData: nil)
        }
    }
}

// MARK: - Utilitats

private func relativeTime(from iso: String?) -> String? {
    guard let iso else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = formatter.date(from: iso)
        ?? {
            let plain = ISO8601DateFormatter()
            plain.formatOptions = [.withInternetDateTime]
            return plain.date(from: iso)
        }()
    guard let date else { return nil }
    let rel = RelativeDateTimeFormatter()
    rel.locale = Locale(identifier: "ca")
    rel.unitsStyle = .abbreviated
    return rel.localizedString(for: date, relativeTo: Date())
}

// MARK: - Vistes

struct BonDiariWidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) private var family

    private var brandRed: Color { Color(red: 0.84, green: 0.27, blue: 0.27) }

    // Mida de lletra i nombre de línies del titular segons la mida del widget.
    private var titleFontSize: CGFloat {
        switch family {
        case .systemSmall: return 14
        case .systemLarge: return 22
        default: return 16
        }
    }

    private var titleLineLimit: Int {
        switch family {
        case .systemSmall: return 5
        case .systemLarge: return 9
        default: return 3
        }
    }

    var body: some View {
        ZStack {
            backgroundLayer
            LinearGradient(
                colors: [.black.opacity(0.05), .black.opacity(0.72)],
                startPoint: .top,
                endPoint: .bottom
            )
            content
        }
        .widgetURL(URL(string: "bondiari://open"))
        .bonDiariContainerBackground(brandRed)
    }

    @ViewBuilder private var backgroundLayer: some View {
        if let data = entry.imageData, let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
        } else {
            LinearGradient(
                colors: [brandRed, brandRed.opacity(0.7)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    @ViewBuilder private var content: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("EL BON DIARI")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(0.5)
                if let category = entry.story?.category, !category.isEmpty {
                    Text("·")
                    Text(category.uppercased())
                        .font(.system(size: 10, weight: .semibold))
                        .lineLimit(1)
                }
                Spacer()
            }
            .foregroundStyle(.white.opacity(0.9))

            Spacer(minLength: 0)

            Text(entry.story?.title ?? "Bones notícies, cada dia.")
                .font(.system(size: titleFontSize, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(titleLineLimit)
                .minimumScaleFactor(0.55)
                .frame(maxWidth: .infinity, alignment: .leading)

            if family != .systemSmall {
                HStack(spacing: 6) {
                    if let source = entry.story?.source, !source.isEmpty {
                        Text(source)
                            .font(.system(size: 11, weight: .semibold))
                            .lineLimit(1)
                    }
                    if let time = relativeTime(from: entry.story?.publishedAt) {
                        Text("· \(time)")
                            .font(.system(size: 11))
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(11)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    }
}

// Compatibilitat iOS 16/17: containerBackground només existeix a partir d'iOS 17.
private extension View {
    @ViewBuilder
    func bonDiariContainerBackground(_ fallback: Color) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(fallback, for: .widget)
        } else {
            self
        }
    }
}

// MARK: - Widget

struct BonDiariWidget: Widget {
    let kind: String = "BonDiariWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            BonDiariWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Bona notícia del dia")
        .description("La bona notícia més recent d'El Bon Diari, sempre a mà.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - @main

@main
struct BonDiariWidgetBundle: WidgetBundle {
    var body: some Widget {
        BonDiariWidget()
    }
}
