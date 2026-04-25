import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ParsedMail } from "@/lib/api";
import { getMailBodyText, sanitizeMailHtml } from "@/lib/mail-parser";

const HEIGHT_BRIDGE_SCRIPT = `
  (function () {
    var scheduled = false;

    function queueHeight() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(sendHeight);
    }

    function sendHeight() {
      scheduled = false;
      var body = document.body;
      var html = document.documentElement;
      var height = Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        html ? html.clientHeight : 0,
        html ? html.scrollHeight : 0,
        html ? html.offsetHeight : 0
      );
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(String(height));
      }
    }

    window.addEventListener('load', queueHeight);
    window.addEventListener('resize', queueHeight);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueHeight);
    }

    var root = document.documentElement || document.body;
    if (root && window.MutationObserver) {
      new MutationObserver(queueHeight).observe(root, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    Array.prototype.forEach.call(document.images || [], function (img) {
      if (img && !img.complete) {
        img.addEventListener('load', queueHeight);
        img.addEventListener('error', queueHeight);
      }
    });

    setTimeout(queueHeight, 0);
    setTimeout(queueHeight, 120);
    setTimeout(queueHeight, 320);
    setTimeout(queueHeight, 800);
    true;
  })();
`;

const LAYOUT_NORMALIZE_SCRIPT = `
  (function () {
    function normalizeNode(node) {
      if (!node || !node.style) return;
      node.style.maxWidth = '100%';
      node.style.wordBreak = 'break-word';
      node.style.overflowWrap = 'anywhere';

      if (node.style.minWidth) {
        node.style.minWidth = '0px';
      }

      if (node.tagName === 'TABLE') {
        node.style.display = 'block';
        node.style.width = '100%';
        node.style.maxWidth = '100%';
        node.style.tableLayout = 'fixed';
      }

      if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'SVG') {
        node.style.maxWidth = '100%';
        node.style.height = 'auto';
      }
    }

    function normalizeAll() {
      normalizeNode(document.documentElement);
      normalizeNode(document.body);
      Array.prototype.forEach.call(
        (document.body && document.body.querySelectorAll('*')) || [],
        normalizeNode
      );
    }

    document.addEventListener('DOMContentLoaded', normalizeAll);
    window.addEventListener('load', normalizeAll);
    setTimeout(normalizeAll, 0);
    setTimeout(normalizeAll, 180);
    setTimeout(normalizeAll, 600);
    true;
  })();
`;

const DEFAULT_HTML_ZOOM = 100;
const MIN_HTML_ZOOM = 75;
const MAX_HTML_ZOOM = 175;
const HTML_ZOOM_STEP = 15;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatHtmlSource(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "(无 HTML 源码)";
  return normalized.replace(/>\s+</g, ">\n<");
}

function buildMailDocument(html: string, isDark: boolean, zoom: number) {
  const bodyColor = isDark ? "#F8FAFC" : "#0F172A";
  const mutedColor = isDark ? "#CBD5E1" : "#475569";
  const linkColor = isDark ? "#60A5FA" : "#2563EB";
  const backgroundColor = "transparent";
  const styleBlock = `
    <meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=5,user-scalable=yes,viewport-fit=cover" />
    <style>
      :root {
        color-scheme: ${isDark ? "dark" : "light"};
        --mail-text-scale: ${zoom}%;
      }
      html {
        background: ${backgroundColor};
        -webkit-text-size-adjust: var(--mail-text-scale);
        text-size-adjust: var(--mail-text-scale);
        overflow-x: hidden;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: ${backgroundColor};
        color: ${bodyColor};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        line-height: 1.72;
        word-break: break-word;
        overflow-wrap: anywhere;
        max-width: 100%;
      }
      body {
        padding: 12px 12px 18px;
        font-size: 16px;
        min-height: 100vh;
        width: 100% !important;
        min-width: 0 !important;
      }
      body > *:first-child {
        margin-top: 0 !important;
      }
      body > *:last-child {
        margin-bottom: 0 !important;
      }
      * {
        box-sizing: border-box;
        max-width: 100% !important;
      }
      body [style*="width"] {
        max-width: 100% !important;
      }
      body [style*="min-width"] {
        min-width: 0 !important;
      }
      img, video, canvas, svg, iframe {
        display: block;
        max-width: 100% !important;
        height: auto !important;
      }
      table, thead, tbody, tfoot, tr, td, th {
        max-width: 100% !important;
      }
      p, div, li, td, th, span {
        line-height: inherit;
      }
      ul, ol {
        padding-left: 1.25em;
      }
      table {
        display: block;
        max-width: 100% !important;
        width: 100% !important;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        border-collapse: collapse;
      }
      td, th {
        white-space: normal !important;
      }
      pre, code {
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere;
      }
      a {
        color: ${linkColor};
        word-break: break-word;
      }
      blockquote {
        margin: 0;
        padding-left: 12px;
        border-left: 3px solid ${mutedColor};
        color: ${mutedColor};
      }
      hr {
        border: 0;
        border-top: 1px solid ${isDark ? "#334155" : "#CBD5E1"};
        margin: 16px 0;
      }
    </style>
  `;

  if (/<head[\s>]/i.test(html)) {
    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${styleBlock}</head>`);
    }

    return html.replace(/<head([^>]*)>/i, `<head$1>${styleBlock}`);
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${styleBlock}</head>`);
  }

  return `<!doctype html><html><head>${styleBlock}</head><body>${html}</body></html>`;
}

export function MailBodyView({
  mail,
}: {
  mail: Pick<ParsedMail, "id" | "html" | "text" | "raw">;
}) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const htmlBody = useMemo(
    () => sanitizeMailHtml(mail.html || ""),
    [mail.html]
  );
  const htmlSource = useMemo(() => formatHtmlSource(mail.html || ""), [mail.html]);
  const textBody = useMemo(
    () => getMailBodyText(mail) || "(无内容)",
    [mail]
  );
  const hasHtml = !!htmlBody;
  const [mode, setMode] = useState<"html" | "text" | "source">(
    hasHtml ? "html" : "text"
  );
  const [htmlZoom, setHtmlZoom] = useState(DEFAULT_HTML_ZOOM);
  const [webHeight, setWebHeight] = useState(180);

  useEffect(() => {
    setMode(hasHtml ? "html" : "text");
    setHtmlZoom(DEFAULT_HTML_ZOOM);
    setWebHeight(180);
  }, [hasHtml, mail.id]);

  const htmlDocument = useMemo(
    () => buildMailDocument(htmlBody, colorScheme === "dark", htmlZoom),
    [colorScheme, htmlBody, htmlZoom]
  );

  const canZoomOut = htmlZoom > MIN_HTML_ZOOM;
  const canZoomIn = htmlZoom < MAX_HTML_ZOOM;

  const handleZoomChange = (delta: number) => {
    setHtmlZoom((current) => {
      const nextZoom = clamp(current + delta, MIN_HTML_ZOOM, MAX_HTML_ZOOM);
      if (nextZoom !== current) {
        setWebHeight(180);
      }
      return nextZoom;
    });
  };

  return (
    <View style={styles.container}>
      {hasHtml ? (
        <View style={styles.toolbar}>
          <View
            style={[
              styles.switchWrap,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {(["html", "text", "source"] as const).map((item) => {
              const selected = mode === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setMode(item)}
                  style={[
                    styles.switchItem,
                    {
                      backgroundColor: selected ? colors.primary : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.switchText,
                      { color: selected ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {item === "html" ? "HTML" : item === "text" ? "文本" : "源码"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === "html" ? (
            <View
              style={[
                styles.zoomWrap,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Pressable
                disabled={!canZoomOut}
                onPress={() => handleZoomChange(-HTML_ZOOM_STEP)}
                style={[
                  styles.zoomButton,
                  !canZoomOut && styles.zoomButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.zoomButtonText,
                    { color: canZoomOut ? colors.foreground : colors.muted },
                  ]}
                >
                  A-
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setHtmlZoom(DEFAULT_HTML_ZOOM);
                  setWebHeight(180);
                }}
                style={styles.zoomValueButton}
              >
                <Text style={[styles.zoomValueText, { color: colors.foreground }]}>
                  {htmlZoom}%
                </Text>
              </Pressable>
              <Pressable
                disabled={!canZoomIn}
                onPress={() => handleZoomChange(HTML_ZOOM_STEP)}
                style={[
                  styles.zoomButton,
                  !canZoomIn && styles.zoomButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.zoomButtonText,
                    { color: canZoomIn ? colors.foreground : colors.muted },
                  ]}
                >
                  A+
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {mode === "html" && hasHtml ? (
        <View
          style={[
            styles.htmlCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              minHeight: 220,
              height: Math.max(220, webHeight),
            },
          ]}
        >
          <WebView
            key={`mail-html-${mail.id}-${colorScheme}-${htmlZoom}`}
            originWhitelist={["*"]}
            source={{ html: htmlDocument }}
            style={styles.webview}
            injectedJavaScriptBeforeContentLoaded={LAYOUT_NORMALIZE_SCRIPT}
            injectedJavaScript={HEIGHT_BRIDGE_SCRIPT}
            scrollEnabled={false}
            nestedScrollEnabled={false}
            domStorageEnabled
            scalesPageToFit
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            onMessage={(event) => {
              const nextHeight = Number(event.nativeEvent.data);
              if (Number.isFinite(nextHeight) && nextHeight > 0) {
                setWebHeight(Math.ceil(nextHeight));
              }
            }}
            onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
            javaScriptEnabled
          />
        </View>
      ) : mode === "source" && hasHtml ? (
        <View
          style={[
            styles.textCard,
            styles.sourceCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            selectable
            style={[
              styles.sourceBody,
              { color: colors.foreground },
            ]}
          >
            {htmlSource}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.textCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            selectable
            style={[styles.textBody, { color: colors.foreground }]}
          >
            {textBody}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  switchWrap: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    alignSelf: "flex-start",
  },
  switchItem: {
    borderRadius: 9,
    minHeight: 40,
    minWidth: 60,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  switchText: {
    fontSize: 13,
    fontWeight: "700",
  },
  zoomWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
  },
  zoomButton: {
    minWidth: 44,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  zoomButtonDisabled: {
    opacity: 0.55,
  },
  zoomButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  zoomValueButton: {
    minWidth: 60,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  zoomValueText: {
    fontSize: 13,
    fontWeight: "700",
  },
  htmlCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  textCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  textBody: {
    fontSize: 15.5,
    lineHeight: 25,
  },
  sourceCard: {
    overflow: "hidden",
  },
  sourceBody: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
});
