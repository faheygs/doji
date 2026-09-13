import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,

  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera } from 'expo-camera';
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
import { InlineFeedback } from '../../components/ui/InlineFeedback';
import { cameraScreenStyles as styles } from '../../components/challenge/cameraScreenStyles';
type FlowStep = 'chooseSource' | 'preview';
const pickerQuality = 1 as const;
export default function CameraScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [flowStep, setFlowStep] = useState<FlowStep>('chooseSource');
  const [caption, setCaption] = useState('');
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [actionError, setActionError] = useState<{ title?: string; message: string } | null>(null);
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
    if (!userEvent || libraryBusy) return;
    setActionError(null);
    setLibraryBusy(true);
    try {
      let photoReady = Boolean(capturedPhoto);
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      if (!cameraPermission.granted) {
        setActionError({ message: 'Allow camera access to capture your proof, or use your library.' });
        return;
      }
      if (needVideo) {
        const microphonePermission = await Camera.requestMicrophonePermissionsAsync();
        if (!microphonePermission.granted) {
          setActionError({ message: 'Allow microphone access to record challenge video.' });
          return;
        }
      }

      if (needPhoto && !capturedPhoto) {
        const image = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: pickerQuality,
          allowsEditing: false,
        });
        if (image.canceled || !image.assets?.[0]?.uri) return;
        setCapturedPhoto(image.assets[0].uri);
        setCapturedFrontPhoto(null);
        photoReady = true;
      }

      if (needVideo && !capturedVideoUri) {
        const video = await ImagePicker.launchCameraAsync({
          mediaTypes: ['videos'],
          videoMaxDuration: 120,
          allowsEditing: false,
        });
        if (video.canceled || !video.assets?.[0]?.uri) {
          if (needPhoto && photoReady) {
            setActionError({ message: 'Your photo is saved here. Add the required video to continue.' });
          }
          return;
        }
        setCapturedVideoUri(video.assets[0].uri);
      } else if (!needVideo) {
        setCapturedVideoUri(null);
      }

      setFlowStep('preview');
    } catch {
      setActionError({ message: 'The phone camera could not open. Try again or use your library.' });
    } finally {
      setLibraryBusy(false);
    }
  }, [
    libraryBusy,
    capturedPhoto,
    capturedVideoUri,
    needPhoto,
    needVideo,
    setCapturedFrontPhoto,
    setCapturedPhoto,
    setCapturedVideoUri,
    userEvent,
  ]);

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
              <Button
                onPress={() => void openCameraCapture()}
                fullWidth
                size="lg"
                loading={libraryBusy}
                disabled={libraryBusy}
              >
                Use phone camera
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

  return null;
}
