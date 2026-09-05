/** Native inventory (149) CS2 slots are sparse: op1 is a custom operation,
 * op5 is reserved, and Examine is op10. They are not cache action index + 1.
 */
export function inventoryWidgetActionIndex(opId: number): number | undefined {
    return ({2:0,3:1,4:2,6:3,7:4} as Record<number,number>)[opId];
}
