import createComponent from '../../../helpers/component.js';
import { InteractableComponentType } from '../../../types/types.js';
import { handleQuoteCustomSelect } from '../../../utils/quote.js';

createComponent({
  type: InteractableComponentType.SelectMenu,
  custom_id: 'quote-custom-select',
  args: ['session_id', 'option'] as const,
  async run(interaction, args, api) {
    if (args.option !== 'size' && args.option !== 'colour') return;
    await handleQuoteCustomSelect(interaction, args.session_id, args.option, api);
  },
});
