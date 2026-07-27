import createComponent from '../../../helpers/component';
import { InteractableComponentType } from '../../../types/types';
import { handleQuoteSelect } from '../../../utils/quote';

createComponent({
  type: InteractableComponentType.SelectMenu,
  custom_id: 'quote-select',
  args: ['session_id', 'option'] as const,
  acknowledge: true,
  async run(interaction, args, api) {
    const { session_id, option } = args;

    await handleQuoteSelect(interaction, session_id, option, api);
  },
});
