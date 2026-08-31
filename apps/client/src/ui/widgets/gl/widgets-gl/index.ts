export type { WidgetNode } from "@client/ui/widgets/WidgetNode";
export type { GLRenderOpts } from "@client/ui/widgets/gl/widgets-gl/glRenderOpts";
export { renderWidgetTreeGL } from "@client/ui/widgets/gl/widgets-gl/renderWidgetTree";
export { beginWidgetUiFrame, processWidgetUiInput, detachGLUI, cleanupInterfaceClickTargets } from "@client/ui/widgets/gl/widgets-gl/frameInput";
export { getVisibleWidgetSurfaceReason } from "@client/ui/widgets/menu/WidgetInteractionResolver";
