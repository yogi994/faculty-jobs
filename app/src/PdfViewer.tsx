import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Shows a notification PDF inside the app. Android's WebView can't draw PDFs
// itself, so the page is rendered by Google's document viewer.
const viewerUrl = (url: string) => `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;

export function PdfViewer({ doc, onClose }: { doc: { url: string; title: string } | null; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);
  if (!doc) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={st.screen} edges={['top', 'bottom', 'left', 'right']}>
        <View style={st.bar}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={st.btn}>✕ Close</Text>
          </Pressable>
          <Text style={st.title} numberOfLines={1}>{doc.title}</Text>
          <Pressable onPress={() => { setLoading(true); setKey((k) => k + 1); }} hitSlop={10} accessibilityRole="button">
            <Text style={st.btn}>↻</Text>
          </Pressable>
        </View>
        <WebView
          key={key}
          source={{ uri: viewerUrl(doc.url) }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          style={st.web}
          setSupportMultipleWindows={false}
        />
        {loading && <ActivityIndicator style={st.spinner} size="large" color="#1F4E79" />}
        <View style={st.foot}>
          <Text style={st.hint}>Blank page? Tap ↻, or open it in the browser.</Text>
          <Pressable onPress={() => Linking.openURL(doc.url)} hitSlop={8} accessibilityRole="link">
            <Text style={st.btn}>Open in browser ↗</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E4E7EC' },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1B1F24' },
  btn: { fontSize: 14, fontWeight: '700', color: '#1F4E79' },
  web: { flex: 1 },
  spinner: { position: 'absolute', top: '45%', alignSelf: 'center' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E4E7EC' },
  hint: { fontSize: 12, color: '#667085', flex: 1, marginRight: 8 },
});
