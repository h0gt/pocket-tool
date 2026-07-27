import createComponent from '../../../helpers/component';
import { InteractableComponentType } from '../../../types/types';
import { handleQuoteCustomSelect } from '../../../utils/quote';

createComponent({
  type: InteractableComponentType.SelectMenu,
  custom_id: 'quote-custom-select',
  args: ['session_id', 'option'] as const,
  async run(interaction, args, api) {
    const { session_id, option } = args;

    if (option !== 'size' && option !== 'color') return;

    await handleQuoteCustomSelect(interaction, session_id, option, api);
  },
});
