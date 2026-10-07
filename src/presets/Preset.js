export function uvOf(x, z, worldSize) {
    return [x / worldSize + 0.5, z / worldSize + 0.5];
}
export function inQRBounds(x, z, worldSize) {
    return Math.abs(x) <= worldSize / 2 && Math.abs(z) <= worldSize / 2;
}
