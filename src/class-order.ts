/**
 * Stable class order, shared by every language. Starts with Japanese classes,
 * followed by overseas classes, from older designs to newer designs.
 * Reference: noro6/kc-web SHIP_TYPES_ALT_INFO and ShipList's class grouping.
 * Adjusted for our merged categories and older classes added to that catalog later.
 * https://github.com/noro6/kc-web/blob/975da86160f35f0fdecb924f0d686630911851da/src/classes/constants/ships.ts
 */
// Japanese DD classes in the bundled catalog; keep identity separate from display names.
export const JAPANESE_DD_CLASSES = ['66','28','12','1','5','10','23','18','30','38','54','22','101'] as const;
export const SHIMAKAZE_CLASS = '22';
export const CLASS_ORDER: Record<string, readonly string[]> = {
  DD: [...JAPANESE_DD_CLASSES, '139','48','61','81','82','129','91','140','87'],
  DE: ['74','77','94','104','85','117', '133','137'],
  CL: ['123','21','4','20','34','16','56','41','52', '89','128','96','98','108','110','92','131','106','99'],
  CA: ['7','13','29','8','9','31', '95','64','121','138','55'],
  BB: ['6','26','2','19','37', '73','113','67','125','134','93','88','47','58','79','107','102','65'],
  CV: ['14','3','17','25','33','43','53', '141','69','134','118','105','78','63','112','68','84'],
  CVL: ['27','32','50','9','15','11','24','75','76', '83','116'],
  AV: ['72','9','15','62','90','59', '70'],
  SS: ['35','40','39','103','127','46','36','71','44','109', '122','124','57','80','114'],
  AUX: ['123','130','72','100','126','50','97','111','49','45','136','60','120','115','132','119'],
};
