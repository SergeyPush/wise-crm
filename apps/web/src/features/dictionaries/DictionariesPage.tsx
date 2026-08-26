import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

/**
 * Экран-заглушка. Справочников в MVP редактируемых три (джерела, причини
 * відмови, теги) и делаются они на этапе 4; пункт меню заведён сейчас,
 * чтобы проверить разграничение прав в сайдбаре.
 */
export function DictionariesPage() {
  return (
    <>
      <PageHeader title="Довідники" />
      <EmptyState
        title="Розділ зʼявиться на етапі 4"
        description="Джерела лідів, причини відмови та теги — редаговані довідники; решта заводиться міграцією"
      />
    </>
  );
}
