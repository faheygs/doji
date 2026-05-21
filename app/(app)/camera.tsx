import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { useRouter, type Href } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  IconCamera,
  IconChevronLeft,
  IconClose,
} from '../../components/icons/Icons';
import { useUserEvent, useCreatePost } from '../../hooks/useUserEvent';
import { useChallengeStore } from '../../stores/useChallengeStore';
import { isExpired } from '../../utils/time';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type FlowStep = 'chooseSource' | 'capturePhoto' | 'captureVideo' | 'preview';

const pickerQuality = 0.85 as const;

export default function CameraScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const facing = 'back' as const;
  const [capturing, setCapturing] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>('chooseSource');
  const [caption, setCaption] = useState('');
  const [videoRecording, setVideoRecording] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const { data: userEvent, isLoading: userEventLoading } = useUserEvent();
  const {
    capturedPhoto,
    capturedFrontPhoto,
    capturedVideoUri,
    setCapturedPhoto,
    setCapturedFrontPhoto,
    setCapturedVideoUri,
    clearCaptures,
  } = useChallengeStore();
  const createPost = useCreatePost();

  const challenge = userEvent?.challenge;
  const needPhoto = challenge?.requires_photo ?? true;
  const needVideo = challenge?.requires_video ?? false;

  useEffect(() => {
    clearCaptures();
  }, [clearCaptures]);

  useEffect(() => {
    if (userEventLoading) return;
    if (!userEvent) {
      Toast.show({ type: 'error', text1: 'No active challenge' });
      router.back();
      return;
    }
    const t = userEvent.challenge?.type;
    if (t && t !== 'photo') {
      router.replace('/(app)/challenge');
    }
  }, [userEvent, userEventLoading, router]);

  const afterPhotoCapture = useCallback(() => {
    if (needVideo) {
      setFlowStep('captureVideo');
    } else {
      setFlowStep('preview');
    }
  }, [needVideo]);

  const handleCapture = async () => {
    if (!cameraRef.current || capturing || !needPhoto) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setCapturedPhoto(photo?.uri ?? null);
      setCapturedFrontPhoto(null);

      afterPhotoCapture();
    } catch {
      Toast.show({ type: 'error', text1: 'Capture failed. Try again.' });
    } finally {
      setCapturing(false);
    }
  };

  const startVideoRecording = useCallback(() => {
    if (!cameraRef.current || videoRecording) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVideoRecording(true);
    const p = cameraRef.current.recordAsync({ maxDuration: 120 });
    p
      .then((vid) => {
        if (vid?.uri) {
          setCapturedVideoUri(vid.uri);
          setFlowStep('preview');
        }
      })
      .catch(() => {
        Toast.show({ type: 'error', text1: 'Recording failed. Try again.' });
      })
      .finally(() => {
        setVideoRecording(false);
      });
  }, [setCapturedVideoUri, videoRecording]);

  const stopVideoRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const pickFromLibrary = useCallback(async () => {
    if (!userEvent || libraryBusy) return;
    setLibraryBusy(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Photo library access is required' });
        return;
      }

      if (needPhoto && needVideo) {
        const img = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: pickerQuality,
        });
        if (img.canceled || !img.assets?.[0]?.uri) return;
        setCapturedPhoto(img.assets[0].uri);
        setCapturedFrontPhoto(null);

        const vid = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['videos'],
          videoMaxDuration: 120,
        });
        if (vid.canceled || !vid.assets?.[0]?.uri) return;
        setCapturedVideoUri(vid.assets[0].uri);
        setFlowStep('preview');
        return;
      }

      if (needVideo && !needPhoto) {
        const vid = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['videos'],
          videoMaxDuration: 120,
        });
        if (vid.canceled || !vid.assets?.[0]?.uri) return;
        setCapturedPhoto(null);
        setCapturedFrontPhoto(null);
        setCapturedVideoUri(vid.assets[0].uri);
        setFlowStep('preview');
        return;
      }

      const img = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: pickerQuality,
      });
      if (img.canceled || !img.assets?.[0]?.uri) return;
      setCapturedPhoto(img.assets[0].uri);
      setCapturedFrontPhoto(null);
      setCapturedVideoUri(null);
      setFlowStep('preview');
    } finally {
      setLibraryBusy(false);
    }
  }, [
    libraryBusy,
    userEvent,
    needPhoto,
    needVideo,
    setCapturedPhoto,
    setCapturedFrontPhoto,
    setCapturedVideoUri,
  ]);

  const openCameraCapture = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Toast.show({ type: 'error', text1: 'Camera access is required' });
        return;
      }
    }
    if (!needPhoto && needVideo) {
      setFlowStep('captureVideo');
      return;
    }
    setFlowStep('capturePhoto');
  }, [permission?.granted, requestPermission, needPhoto, needVideo]);

  const handleRetake = () => {
    clearCaptures();
    setCaption('');
    setFlowStep('chooseSource');
  };

  const handlePost = async () => {
    if (!userEvent) return;

    if (challenge?.requires_photo && !capturedPhoto) {
      Toast.show({ type: 'error', text1: 'This challenge needs a photo.' });
      return;
    }
    if (challenge?.requires_video && !capturedVideoUri) {
      Toast.show({ type: 'error', text1: 'This challenge needs a video.' });
      return;
    }
    if (challenge?.requires_text && !caption.trim()) {
      Toast.show({ type: 'error', text1: 'Add something in the caption for this challenge.' });
      return;
    }

    const isLate = isExpired(userEvent.expires_at);

    createPost.mutate(
      {
        userEventId: userEvent.id,
        photoUri: capturedPhoto,
        frontPhotoUri: capturedFrontPhoto,
        videoUri: capturedVideoUri,
        caption,
        isLate,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          clearCaptures();
          router.replace('/(app)/index' as Href);
        },
        onError: (err: Error) => {
          Toast.show({ type: 'error', text1: err.message ?? 'Failed to post' });
        },
      },
    );
  };

  const canPreview = Boolean(capturedPhoto || capturedVideoUri);

  if (userEventLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (!userEvent) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (flowStep === 'chooseSource') {
    const webHint = Platform.OS === 'web' ? 'Use your photo library.' : '';
    return (
      <SafeAreaView style={[styles.chooseRoot, { backgroundColor: colors.background }]}>
        <View style={styles.chooseHeader}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={styles.headerButtonDark}>
            <IconClose size={26} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.chooseBody}>
          <IconCamera size={48} color={colors.textSecondary} />
          <Text variant="headingLarge" style={styles.chooseTitle}>
            Add proof
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.chooseSub}>
            {needPhoto && needVideo
              ? 'You need a photo and a video for this challenge.'
              : needVideo
                ? 'This challenge needs a video.'
                : 'Take a photo or pick one from your library.'}
            {webHint ? `\n${webHint}` : ''}
          </Text>
          <View style={styles.chooseButtons}>
            {Platform.OS !== 'web' ? (
              <Button onPress={() => void openCameraCapture()} fullWidth size="lg">
                Use camera
              </Button>
            ) : null}
            <Button
              onPress={() => void pickFromLibrary()}
              variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
              fullWidth
              size="lg"
              loading={libraryBusy}
              disabled={libraryBusy}
            >
              Choose from library
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (
    (flowStep === 'capturePhoto' || flowStep === 'captureVideo') &&
    permission === null
  ) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (
    (flowStep === 'capturePhoto' || flowStep === 'captureVideo') &&
    permission &&
    !permission.granted
  ) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.permissionContainer}>
          <IconCamera size={56} color={colors.textSecondary} />
          <Text variant="headingLarge" style={{ textAlign: 'center' }}>
            Camera access required
          </Text>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            Camera is needed to capture your challenge proof. You can always use your photo library
            instead—go back and choose library.
          </Text>
          <Button onPress={requestPermission} fullWidth size="lg">
            Allow camera
          </Button>
          <Button
            onPress={() => setFlowStep('chooseSource')}
            variant="ghost"
            fullWidth
          >
            Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (flowStep === 'preview' && canPreview) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.previewContent, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <SafeAreaView>
            <View style={styles.previewHeader}>
              <TouchableOpacity onPress={handleRetake} hitSlop={16} style={styles.previewHeaderBtn}>
                <IconChevronLeft size={22} color={colors.textSecondary} />
                <Text variant="headingMedium" color={colors.textSecondary}>
                  Retake
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {capturedPhoto ? (
            <View style={styles.dualPhotoContainer}>
              <Image
                source={{ uri: capturedPhoto }}
                style={styles.mainPreview}
                contentFit="cover"
              />
              {capturedFrontPhoto ? (
                <View style={[styles.frontPreviewContainer, { borderColor: colors.background }]}>
                  <Image
                    source={{ uri: capturedFrontPhoto }}
                    style={styles.frontPreview}
                    contentFit="cover"
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {capturedVideoUri ? (
            <View style={styles.videoPreviewWrap}>
              <Video
                source={{ uri: capturedVideoUri }}
                style={styles.videoPreview}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
              />
            </View>
          ) : null}

          <View style={styles.previewFooter}>
            <Input
              placeholder="Add a caption... (optional)"
              value={caption}
              onChangeText={setCaption}
              multiline
              containerStyle={styles.captionInput}
            />
            <Button
              onPress={handlePost}
              loading={createPost.isPending}
              fullWidth
              size="lg"
            >
              Share
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const showPhotoControls = flowStep === 'capturePhoto' && needPhoto;
  const showVideoControls = flowStep === 'captureVideo' && needVideo;

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode={showVideoControls ? 'video' : 'picture'}
        mute
      />

      <SafeAreaView style={styles.cameraOverlay}>
        <View style={styles.cameraHeader}>
          <TouchableOpacity
            onPress={() => setFlowStep('chooseSource')}
            hitSlop={16}
            style={styles.headerButton}
          >
            <IconClose size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
        </View>

        {showPhotoControls ? (
          <>
            <View style={styles.captureHint}>
              <Text variant="bodySmall" color="rgba(255,255,255,0.7)" style={{ textAlign: 'center' }}>
                Tap to capture your photo
              </Text>
            </View>
            <View style={styles.cameraFooter}>
              <TouchableOpacity
                onPress={handleCapture}
                disabled={capturing}
                style={[styles.captureButton, capturing && styles.captureButtonCapturing]}
                activeOpacity={0.8}
              >
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {showVideoControls ? (
          <>
            <View style={styles.captureHint}>
              <Text variant="bodySmall" color="rgba(255,255,255,0.7)" style={{ textAlign: 'center' }}>
                {videoRecording
                  ? 'Tap stop when you are done.'
                  : 'Tap record to capture your clip (up to 2 min).'}
              </Text>
            </View>
            <View style={styles.cameraFooter}>
              <TouchableOpacity
                onPress={videoRecording ? stopVideoRecording : startVideoRecording}
                style={[styles.recordOuter, videoRecording && styles.recordOuterActive]}
                activeOpacity={0.85}
              >
                <View style={[styles.recordInner, videoRecording && styles.recordInnerSquare]} />
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  chooseRoot: {
    flex: 1,
  },
  chooseHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    alignItems: 'flex-start',
  },
  headerButtonDark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseBody: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    gap: Spacing.md,
    alignItems: 'center',
  },
  chooseTitle: {
    textAlign: 'center',
  },
  chooseSub: {
    textAlign: 'center',
    lineHeight: 22,
  },
  chooseButtons: {
    width: '100%',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'space-between',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  captureHint: {
    paddingHorizontal: Spacing.xl,
  },
  cameraFooter: {
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonCapturing: {
    opacity: 0.6,
    transform: [{ scale: 0.95 }],
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  recordOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  recordOuterActive: {
    borderColor: '#ff4444',
  },
  recordInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ff4444',
  },
  recordInnerSquare: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  permissionContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  previewContent: {
    flexGrow: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  previewHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dualPhotoContainer: {
    position: 'relative',
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  mainPreview: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  frontPreviewContainer: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 3,
  },
  frontPreview: {
    width: 90,
    height: 90,
  },
  videoPreviewWrap: {
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
    marginTop: Spacing.sm,
  },
  videoPreview: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.5625,
  },
  previewFooter: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  captionInput: {
    flex: 1,
  },
});
