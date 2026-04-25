import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Keyboard,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewProps,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type SwipeDirection = "left" | "right";

type SwipeableScreenProps = {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  disabled?: boolean;
  suspendWhileKeyboardVisible?: boolean;
};

export type SwipeableScreenControls = {
  setSwipeSuspended: (suspended: boolean) => void;
};

type SwipeSuspendViewProps = ViewProps & {
  children: React.ReactNode;
  resumeDelayMs?: number;
};

const SWIPE_ACTIVATION_DISTANCE = 18;
const SWIPE_TRIGGER_DISTANCE = 76;
const SWIPE_TRIGGER_VELOCITY = 720;
const SWIPE_PREVIEW_LIMIT = 34;
const SWIPE_EDGE_WIDTH = 24;
const SWIPE_VERTICAL_FAIL_DISTANCE = 18;
const SWIPE_HORIZONTAL_DOMINANCE = 1.35;
const SWIPE_SUSPEND_RESUME_DELAY_MS = 120;

export const SwipeableScreenContext = createContext<SwipeableScreenControls | null>(null);

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

function getFirstTouch(event: any) {
  "worklet";
  return event.changedTouches?.[0] ?? event.allTouches?.[0];
}

export function SwipeSuspendView({
  children,
  onTouchCancel,
  onTouchEnd,
  onTouchStart,
  resumeDelayMs = SWIPE_SUSPEND_RESUME_DELAY_MS,
  ...viewProps
}: SwipeSuspendViewProps) {
  const controls = useContext(SwipeableScreenContext);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const suspend = useCallback(
    (event: GestureResponderEvent, handler?: (event: GestureResponderEvent) => void) => {
      clearResumeTimer();
      controls?.setSwipeSuspended(true);
      handler?.(event);
    },
    [clearResumeTimer, controls]
  );

  const resume = useCallback(
    (event: GestureResponderEvent, handler?: (event: GestureResponderEvent) => void) => {
      handler?.(event);
      clearResumeTimer();
      resumeTimerRef.current = setTimeout(() => {
        controls?.setSwipeSuspended(false);
        resumeTimerRef.current = null;
      }, resumeDelayMs);
    },
    [clearResumeTimer, controls, resumeDelayMs]
  );

  useEffect(
    () => () => {
      clearResumeTimer();
      controls?.setSwipeSuspended(false);
    },
    [clearResumeTimer, controls]
  );

  return (
    <View
      {...viewProps}
      onTouchCancel={(event) => resume(event, onTouchCancel)}
      onTouchEnd={(event) => resume(event, onTouchEnd)}
      onTouchStart={(event) => suspend(event, onTouchStart)}
    >
      {children}
    </View>
  );
}

export function SwipeableScreen({
  children,
  onSwipeLeft,
  onSwipeRight,
  disabled,
  suspendWhileKeyboardVisible = true,
}: SwipeableScreenProps) {
  const translateX = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const childInteractionSuspended = useSharedValue(false);
  const keyboardInteractionSuspended = useSharedValue(false);

  const handleSwipe = useCallback(
    (direction: SwipeDirection) => {
      if (direction === "left") {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    },
    [onSwipeLeft, onSwipeRight]
  );

  const canSwipeLeft = !!onSwipeLeft && !disabled;
  const canSwipeRight = !!onSwipeRight && !disabled;

  const controls = useMemo<SwipeableScreenControls>(
    () => ({
      setSwipeSuspended: (suspended) => {
        childInteractionSuspended.value = suspended;
      },
    }),
    [childInteractionSuspended]
  );

  useEffect(() => {
    if (!suspendWhileKeyboardVisible) return;
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      keyboardInteractionSuspended.value = true;
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      keyboardInteractionSuspended.value = false;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      keyboardInteractionSuspended.value = false;
    };
  }, [keyboardInteractionSuspended, suspendWhileKeyboardVisible]);

  const createGesture = useCallback(
    (direction: SwipeDirection) => {
      const isLeftSwipe = direction === "left";
      const canSwipe = isLeftSwipe ? canSwipeLeft : canSwipeRight;
      const edgeHitSlop = isLeftSwipe
        ? { right: 0, width: SWIPE_EDGE_WIDTH }
        : { left: 0, width: SWIPE_EDGE_WIDTH };

      return Gesture.Pan()
        .enabled(canSwipe)
        .hitSlop(edgeHitSlop)
        .manualActivation(true)
        .maxPointers(1)
        .cancelsTouchesInView(false)
        .onTouchesDown((event) => {
          const touch = getFirstTouch(event);
          if (!touch) return;
          touchStartX.value = touch.x;
          touchStartY.value = touch.y;
        })
        .onTouchesMove((event, manager) => {
          if (
            !canSwipe ||
            childInteractionSuspended.value ||
            keyboardInteractionSuspended.value ||
            (event.allTouches?.length ?? 0) > 1
          ) {
            manager.fail();
            return;
          }

          const touch = getFirstTouch(event);
          if (!touch) return;

          const deltaX = touch.x - touchStartX.value;
          const deltaY = touch.y - touchStartY.value;
          const absX = Math.abs(deltaX);
          const absY = Math.abs(deltaY);

          if (
            absY >= SWIPE_VERTICAL_FAIL_DISTANCE &&
            absY > absX / SWIPE_HORIZONTAL_DOMINANCE
          ) {
            manager.fail();
            return;
          }

          if (isLeftSwipe) {
            if (deltaX >= SWIPE_ACTIVATION_DISTANCE) {
              manager.fail();
              return;
            }
            if (
              deltaX <= -SWIPE_ACTIVATION_DISTANCE &&
              absX > absY * SWIPE_HORIZONTAL_DOMINANCE
            ) {
              manager.activate();
            }
            return;
          }

          if (deltaX <= -SWIPE_ACTIVATION_DISTANCE) {
            manager.fail();
            return;
          }
          if (
            deltaX >= SWIPE_ACTIVATION_DISTANCE &&
            absX > absY * SWIPE_HORIZONTAL_DOMINANCE
          ) {
            manager.activate();
          }
        })
        .onUpdate((event) => {
          const translation = event.translationX;
          if (!canSwipe) {
            translateX.value = 0;
            return;
          }
          if (isLeftSwipe && translation > 0) {
            translateX.value = 0;
            return;
          }
          if (!isLeftSwipe && translation < 0) {
            translateX.value = 0;
            return;
          }
          translateX.value = clamp(
            translation * 0.22,
            -SWIPE_PREVIEW_LIMIT,
            SWIPE_PREVIEW_LIMIT
          );
        })
        .onEnd((event) => {
          const swipedLeft =
            isLeftSwipe &&
            canSwipe &&
            (event.translationX <= -SWIPE_TRIGGER_DISTANCE ||
              event.velocityX <= -SWIPE_TRIGGER_VELOCITY);
          const swipedRight =
            !isLeftSwipe &&
            canSwipe &&
            (event.translationX >= SWIPE_TRIGGER_DISTANCE ||
              event.velocityX >= SWIPE_TRIGGER_VELOCITY);

          if (swipedLeft || swipedRight) {
            translateX.value = withTiming(
              swipedLeft ? -SWIPE_PREVIEW_LIMIT : SWIPE_PREVIEW_LIMIT,
              { duration: 80 }
            );
            runOnJS(handleSwipe)(swipedLeft ? "left" : "right");
          }

          translateX.value = withSpring(0, {
            damping: 22,
            stiffness: 260,
            mass: 0.8,
          });
        })
        .onFinalize(() => {
          translateX.value = withSpring(0, {
            damping: 22,
            stiffness: 260,
            mass: 0.8,
          });
        });
    },
    [
      canSwipeLeft,
      canSwipeRight,
      childInteractionSuspended,
      handleSwipe,
      keyboardInteractionSuspended,
      touchStartX,
      touchStartY,
      translateX,
    ]
  );

  const activeGestures = useMemo(() => {
    const gestures: any[] = [];
    if (canSwipeRight) {
      gestures.push(createGesture("right"));
    }
    if (canSwipeLeft) {
      gestures.push(createGesture("left"));
    }
    return gestures;
  }, [canSwipeLeft, canSwipeRight, createGesture]);

  const swipeGesture = useMemo(() => {
    if (activeGestures.length === 1) return activeGestures[0];
    if (activeGestures.length > 1) return Gesture.Simultaneous(...activeGestures);
    return null;
  }, [activeGestures]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const content = (
    <SwipeableScreenContext.Provider value={controls}>
      {children}
    </SwipeableScreenContext.Provider>
  );

  if (!swipeGesture) {
    return <>{content}</>;
  }

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[styles.root, animatedStyle]}>{content}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
