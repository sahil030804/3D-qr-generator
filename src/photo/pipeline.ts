/** Everything the photo mode needs, behind one import so the app can load it lazily. */
export { estimateDepth, type DepthResult } from './depth';
export { buildPhotoModel, prepareCode, PhotoError, type PhotoCode, type PhotoModel } from './photoModel';
export { chooseLook, LOOK_ORDER, type LookName } from './scanColors';
export { decodeWithZXing } from './decoder';
