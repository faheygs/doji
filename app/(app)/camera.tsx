import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AppKeyboardAwareScrollView } from '../../components/ui/AppKeyboardAwareScrollView';
import { AppVideo } from '../../components/ui/AppVideo';
import { IconCamera, IconChevronLeft, IconClose } from '../../components/icons/Icons';
import { useUserEvent, useCreatePost } from '../../hooks/useUserEvent';
import { useChallengeStore } from '../../stores/useChallengeStore';
import { backOrHome, navigateToFeedAfterChallengeComplete } from '../../lib/navigationReturn';
import { dojiSubmissionErrorCopy } from '../../lib/dojiSubmissionError';
import { required, validationMessage } from '../../lib/formValidation';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';
import { CameraTopControls, CameraZoomControls } from '../../components/challenge/CameraCaptureControls';
import { InlineFeedback } from '../../components/ui/InlineFeedback';
import { cameraScreenStyles as styles } from '../../components/challenge/cameraScreenStyles';
type FlowStep = 'chooseSource' | 'capturePhoto' | 'captureVideo' | 'preview';
const pickerQuality = 0.85 as const;
export default function CameraScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [zoom, setZoom] = useState(0);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>('chooseSource');
  const [caption, setCaption] = useState('');
  const [videoRecording, setVideoRecording] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [actionError, setActionError] = useState<{ title?: string; message: string } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const {
    data: userEvent,
    isLoading: userEventLoading,
    isFetching: userEventFetching,
    refetch: refetchUserEvent,
  } = useUserEvent();
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
    /** Avoid `router.back()` during TanStack refetch (invalidate after submit) when data can flicker. */
    if (!userEvent && !userEventFetching) {
      backOrHome(router);
      return;
    }
    if (!userEvent) return;
    const t = userEvent.challenge?.type;
    if (t && t !== 'photo') {
      router.replace('/(app)/challenge');
    }
  }, [userEvent, userEventLoading, userEventFetching, router]);

  const afterPhotoCapture = useCallback(() => {
    if (needVideo) {
      setFlowStep('captureVideo');
    } else {
      setFlowStep('preview');
    }
  }, [needVideo]);

  const handleCapture = async () => {
    if (!cameraRef.current || capturing || !needPhoto) return;
    setActionError(null);
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setCapturedPhoto(photo?.uri ?? null);
      setCapturedFrontPhoto(null);

      afterPhotoCapture();
    } catch {
      setActionError({ message: 'Could not capture the photo. Try again.' });
    } finally {
      setCapturing(false);
    }
  };

  const startVideoRecording = useCallback(() => {
    if (!cameraRef.current || videoRecording) return;
    setActionError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVideoRecording(true);
    const p = cameraRef.current.recordAsync({ maxDuration: 120 });
    p.then((vid) => {
      if (vid?.uri) {
        setCapturedVideoUri(vid.uri);
        setFlowStep('preview');
      }
    })
      .catch(() => {
        setActionError({ message: 'Could not record the video. Try again.' });
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
    setActionError(null);
    setLibraryBusy(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setActionError({ message: 'Allow photo library access to choose your proof.' });
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
    setActionError(null);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setActionError({ message: 'Allow camera access to capture your proof, or use your library.' });
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
    setActionError(null);
    setFlowStep('chooseSource');
  };

  const handlePost = async () => {
    if (!userEvent) return;
    setActionError(null);
    if (challenge?.requires_photo && !capturedPhoto) {
      setActionError({ message: 'Add the required photo before sharing.' });
      return;
    }
    if (challenge?.requires_video && !capturedVideoUri) {
      setActionError({ message: 'Add the required video before sharing.' });
      return;
    }
    if (challenge?.requires_text && !caption.trim()) {
      setActionError({ message: 'Add the required caption before sharing.' });
      return;
    }

    createPost.mutate(
      {
        userEventId: userEvent.id,
        photoUri: capturedPhoto,
        frontPhotoUri: capturedFrontPhoto,
        videoUri: capturedVideoUri,
        caption,
        isLate: false,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          clearCaptures();
          navigateToFeedAfterChallengeComplete(router);
        },
        onError: (err: Error) => {
          const copy = dojiSubmissionErrorCopy(err);
          setActionError({ title: copy.title, message: copy.message });
        },
      },
    );
  };

  const canPreview = Boolean(capturedPhoto || capturedVideoUri);
  const captionRequired = Boolean(challenge?.requires_text);
  const captionValidation = useMemo(() => {
    if (!captionRequired) return { ok: true as const };
    return required(caption, 'Add a caption for this challenge.');
  }, [captionRequired, caption]);
  const canPost = canPreview && (!captionRequired || captionValidation.ok) && !createPost.isPending;

  if (userEventLoading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (!userEvent) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (flowStep === 'chooseSource') {
    const webHint = Platform.OS === 'web' ? 'Use your photo library.' : '';
    return (
      <SafeAreaView style={[styles.chooseRoot, { backgroundColor: colors.background }]}>
        <View style={styles.chooseHeader}>
          <TouchableOpacity
            onPress={() => backOrHome(router)}
            hitSlop={16}
            style={styles.headerButtonDark}
            accessibilityRole="button"
            accessibilityLabel="Close camera"
          >
            <IconClose size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <ChallengeTimer
            expiresAt={userEvent.status === 'buy_in_open' ? null : userEvent.expires_at}
            onExpire={() => void refetchUserEvent()}
          />
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
          {actionError ? <InlineFeedback {...actionError} style={{ width: '100%' }} /> : null}
        </View>
      </SafeAreaView>
    );
  }

  if ((flowStep === 'capturePhoto' || flowStep === 'captureVideo') && permission === null) {
    return (
      <View
        style={[
          styles.container,
          {
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.mediaLetterbox,
          },
        ]}
      >
        <ActivityIndicator color={colors.onPrimary} />
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
          <Button onPress={() => setFlowStep('chooseSource')} variant="ghost" fullWidth>
            Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (flowStep === 'preview' && canPreview) {
    return (
      <>
        <AppKeyboardAwareScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={[styles.previewContent, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
        >
          <SafeAreaView>
            <View style={styles.previewHeader}>
              <TouchableOpacity
                onPress={handleRetake}
                hitSlop={16}
                style={styles.previewHeaderBtn}
                accessibilityRole="button"
                accessibilityLabel="Retake media"
              >
                <IconChevronLeft size={22} color={colors.textSecondary} />
                <Text variant="headingMedium" color={colors.textSecondary}>
                  Retake
                </Text>
              </TouchableOpacity>
              <ChallengeTimer
                expiresAt={userEvent.status === 'buy_in_open' ? null : userEvent.expires_at}
                onExpire={() => void refetchUserEvent()}
              />
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
            <View style={[styles.videoPreviewWrap, { backgroundColor: colors.mediaLetterbox }]}>
              <AppVideo
                uri={capturedVideoUri}
                style={styles.videoPreview}
                nativeControls
                contentFit="contain"
              />
            </View>
          ) : null}

          <View style={styles.previewFooter}>
            <Input
              placeholder={
                captionRequired ? 'Add a caption (required)…' : 'Add a caption... (optional)'
              }
              value={caption}
              onChangeText={(value) => {
                setCaption(value);
                setActionError(null);
              }}
              multiline
              containerStyle={styles.captionInput}
              error={captionRequired ? validationMessage(captionValidation) : undefined}
              hint={captionRequired ? 'Caption required for this challenge' : undefined}
            />
            {actionError ? <InlineFeedback {...actionError} /> : null}
            <Button
              onPress={handlePost}
              loading={createPost.isPending}
              fullWidth
              size="lg"
              disabled={!canPost}
            >
              Share
            </Button>
          </View>
        </AppKeyboardAwareScrollView>
      </>
    );
  }

  const showPhotoControls = flowStep === 'capturePhoto' && needPhoto;
  const showVideoControls = flowStep === 'captureVideo' && needVideo;

  return (
    <View style={[styles.container, { backgroundColor: colors.mediaLetterbox }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        zoom={zoom}
        flash={flashEnabled && facing === 'back' ? 'on' : 'off'}
        mode={showVideoControls ? 'video' : 'picture'}
        mute
      />

      <SafeAreaView style={styles.cameraOverlay}>
        <CameraTopControls
          flashEnabled={flashEnabled}
          flashAvailable={facing === 'back'}
          expiresAt={userEvent.status === 'buy_in_open' ? null : userEvent.expires_at}
          onClose={() => setFlowStep('chooseSource')}
          onFlip={() => {
            setFacing((current) => (current === 'back' ? 'front' : 'back'));
            setFlashEnabled(false);
          }}
          onToggleFlash={() => setFlashEnabled((enabled) => !enabled)}
          onExpire={() => void refetchUserEvent()}
          color={colors.onPrimary}
        />

        {actionError ? <InlineFeedback {...actionError} style={{ marginHorizontal: Spacing.md }} /> : null}

        {showPhotoControls || showVideoControls ? (
          <CameraZoomControls zoom={zoom} onChange={setZoom} color={colors.onPrimary} />
        ) : null}

        {showPhotoControls ? (
          <>
            <View style={styles.captureHint}>
              <Text
                variant="bodySmall"
                color={colors.onPrimary}
                style={{ textAlign: 'center', opacity: 0.7 }}
              >
                Tap to capture your photo
              </Text>
            </View>
            <View style={styles.cameraFooter}>
              <TouchableOpacity
                onPress={handleCapture}
                disabled={capturing}
                style={[
                  styles.captureButton,
                  {
                    borderColor: colors.onPrimary,
                    backgroundColor: `${colors.onPrimary}4D`,
                  },
                  capturing && styles.captureButtonCapturing,
                ]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                accessibilityState={{ disabled: capturing, busy: capturing }}
              >
                <View style={[styles.captureButtonInner, { backgroundColor: colors.onPrimary }]} />
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {showVideoControls ? (
          <>
            <View style={styles.captureHint}>
              <Text
                variant="bodySmall"
                color={colors.onPrimary}
                style={{ textAlign: 'center', opacity: 0.7 }}
              >
                {videoRecording
                  ? 'Tap stop when you are done.'
                  : 'Tap record to capture your clip (up to 2 min).'}
              </Text>
            </View>
            <View style={styles.cameraFooter}>
              <TouchableOpacity
                onPress={videoRecording ? stopVideoRecording : startVideoRecording}
                style={[
                  styles.recordOuter,
                  {
                    borderColor: videoRecording ? colors.danger : colors.onPrimary,
                    backgroundColor: videoRecording
                      ? `${colors.danger}40`
                      : `${colors.onPrimary}40`,
                  },
                ]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={videoRecording ? 'Stop recording video' : 'Start recording video'}
                accessibilityState={{ selected: videoRecording }}
              >
                <View
                  style={[
                    styles.recordInner,
                    { backgroundColor: colors.danger },
                    videoRecording && styles.recordInnerSquare,
                  ]}
                />
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
